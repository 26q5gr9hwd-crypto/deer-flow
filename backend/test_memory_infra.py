"""Test script to verify all memory infrastructure is working.
Run with: cd /opt/deer-flow/backend && uv run python test_memory_infra.py
"""
import os
import sys

def test_postgres():
    import psycopg2
    conn = psycopg2.connect(dbname="vesper", user="n8n", password="EHYUBBanhcbedheu391318hcehu", host="localhost", port=5432)
    cur = conn.cursor()
    cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector';")
    result = cur.fetchone()
    assert result is not None, "pgvector extension not installed!"
    print("pgvector extension installed")
    for table in ['projects', 'tasks', 'events', 'memory_metadata']:
        cur.execute(f"SELECT COUNT(*) FROM {table};")
        count = cur.fetchone()[0]
        print(f"Table '{table}' exists ({count} rows)")
    cur.execute("SELECT name, status FROM projects WHERE name = 'VESPER v2';")
    result = cur.fetchone()
    assert result is not None, "Seed project not found!"
    print(f"Seed project: {result[0]} ({result[1]})")
    conn.close()
    print("Postgres: ALL GOOD")

def test_falkordb():
    from falkordb import FalkorDB
    db = FalkorDB(host='localhost', port=6379)
    graph = db.select_graph('vesper_test')
    graph.query("CREATE (n:Test {name: 'infra_check'}) RETURN n")
    result = graph.query("MATCH (n:Test) RETURN n.name")
    assert len(result.result_set) > 0, "FalkorDB query returned no results!"
    print(f"FalkorDB: wrote and read node '{result.result_set[0][0]}'")
    graph.delete()
    print("FalkorDB: ALL GOOD")

def test_fastembed():
    from fastembed import TextEmbedding
    model = TextEmbedding(model_name="nomic-ai/nomic-embed-text-v1.5")
    embeddings = list(model.embed(["test sentence for VESPER memory"]))
    assert len(embeddings) == 1
    assert len(embeddings[0]) > 0
    print(f"fastembed: generated embedding with {len(embeddings[0])} dimensions")
    print("fastembed: ALL GOOD")

def test_mem0():
    from mem0 import Memory
    api_key = os.environ.get('OPENROUTER_API_KEY')
    if not api_key:
        print("OPENROUTER_API_KEY not set - skipping Mem0 LLM test")
        return
    config = {
        "version": "v1.1",
        "llm": {"provider": "openai", "config": {"model": "qwen/qwen3-235b-a22b-2507", "api_key": api_key, "openai_base_url": "https://openrouter.ai/api/v1", "temperature": 0.1}},
        "embedder": {"provider": "huggingface", "config": {"model": "nomic-ai/nomic-embed-text-v1.5", "model_kwargs": {"trust_remote_code": True}, "embedding_dims": 768}},
        "vector_store": {"provider": "pgvector", "config": {"dbname": "vesper", "user": "n8n", "password": "EHYUBBanhcbedheu391318hcehu", "host": "localhost", "port": 5432, "collection_name": "vesper_test", "embedding_model_dims": 768}},
    }
    m = Memory.from_config(config)
    print("Testing mem0.add()...")
    result = m.add("Daniel prefers Hetzner for VPS hosting. VESPER runs on DeerFlow.", user_id="daniel", metadata={"source": "test"})
    print(f"mem0.add() returned: {result}")
    print("Testing mem0.search()...")
    results = m.search("hosting provider", user_id="daniel")
    print(f"mem0.search() returned {len(results)} results")
    all_memories = m.get_all(user_id="daniel")
    mems = all_memories.get("results", all_memories) if isinstance(all_memories, dict) else all_memories
    for mem in mems:
        mid = mem["id"] if isinstance(mem, dict) else mem
        m.delete(mid)



    print("Cleaned up test memories")
    print("Mem0: ALL GOOD")

if __name__ == "__main__":
    print("=" * 60)
    print("VESPER Memory Infrastructure Test")
    print("=" * 60)
    tests = [("Postgres + pgvector + state tables", test_postgres), ("FalkorDB graph store", test_falkordb), ("fastembed local embeddings", test_fastembed), ("Mem0 end-to-end", test_mem0)]
    passed = 0
    failed = 0
    for name, test_fn in tests:
        print(f"--- Testing: {name} ---")
        try:
            test_fn()
            passed += 1
        except Exception as e:
            print(f"FAILED: {e}")
            failed += 1
    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)
    sys.exit(0 if failed == 0 else 1)
