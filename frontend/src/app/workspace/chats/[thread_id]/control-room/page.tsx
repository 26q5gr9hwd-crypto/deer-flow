import { ControlRoomView } from "@/components/workspace/control-room/control-room-view";

export default async function ControlRoomPage({
  params,
}: {
  params: Promise<{ thread_id: string }>;
}) {
  const { thread_id } = await params;

  return <ControlRoomView threadId={thread_id} />;
}
