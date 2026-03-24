"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { getBackendBaseURL } from "@/core/config";

type OngoingThreadResponse = {
  thread_id: string;
};

export function useThreadChat() {
  const { thread_id: threadIdFromPath } = useParams<{ thread_id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threadId, setThreadId] = useState(() => threadIdFromPath);
  const [isNewThread, setIsNewThread] = useState(
    () => threadIdFromPath === "new",
  );
  const [isResolvingThread, setIsResolvingThread] = useState(
    () => threadIdFromPath === "new",
  );

  useEffect(() => {
    if (!pathname.endsWith("/new")) {
      setThreadId(threadIdFromPath);
      setIsNewThread(false);
      setIsResolvingThread(false);
      return;
    }

    const controller = new AbortController();
    const query = searchParams.toString();
    setThreadId(threadIdFromPath);
    setIsNewThread(true);
    setIsResolvingThread(true);

    void fetch(`${getBackendBaseURL()}/api/channels/telegram/ongoing-thread`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to resolve ongoing thread: ${response.status}`);
        }
        return (await response.json()) as OngoingThreadResponse;
      })
      .then((data) => {
        if (!data.thread_id) {
          throw new Error("Missing ongoing thread id");
        }
        setThreadId(data.thread_id);
        setIsNewThread(false);
        const nextPath = query
          ? `/workspace/chats/${data.thread_id}?${query}`
          : `/workspace/chats/${data.thread_id}`;
        router.replace(nextPath, { scroll: false });
      })
      .catch((error) => {
        console.error("Failed to resolve ongoing VESPER thread", error);
      })
      .finally(() => {
        setIsResolvingThread(false);
      });

    return () => controller.abort();
  }, [pathname, router, searchParams, threadIdFromPath]);

  const isMock = searchParams.get("mock") === "true";
  return { threadId, isNewThread, setIsNewThread, isMock, isResolvingThread };
}
