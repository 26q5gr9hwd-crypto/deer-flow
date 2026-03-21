"""VESPER Memory Configuration - Mem0 + pgvector + FalkorDB"""
import os

# Load .env to ensure API keys are available at import time
from dotenv import load_dotenv
import pathlib
_env_path = pathlib.Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # fallback: search parent dirs


MEM0_CONFIG = {
    "version": "v1.1",
    "llm": {
        "provider": "openai",
        "config": {
            "model": "qwen/qwen3-235b-a22b-2507",
            "api_key": os.environ.get("OPENROUTER_API_KEY", ""),
            "openai_base_url": "https://openrouter.ai/api/v1",
            "temperature": 0.1,
        }
    },
    "embedder": {
        "provider": "huggingface",
        "config": {
            "model": "nomic-ai/nomic-embed-text-v1.5",
            "model_kwargs": {"trust_remote_code": True},
            "embedding_dims": 768,
        }
    },
    "vector_store": {
        "provider": "pgvector",
        "config": {
            "dbname": "vesper",
            "user": "n8n",
            "password": "EHYUBBanhcbedheu391318hcehu",
            "host": "localhost",
            "port": 5432,
            "collection_name": "vesper_memories",
            "embedding_model_dims": 768,
        }
    },
}
