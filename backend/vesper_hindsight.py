import httpx
import asyncio
from datetime import datetime
from typing import Optional

HINDSIGHT_BASE = 'http://localhost:8888/v1/default'
VESPER_BANK = 'vesper'

_client = httpx.AsyncClient(timeout=30.0)

async def _init_bank():
    payload = {
        'name': 'VESPER',
        'background': 'I am VESPER, an autonomous AI agent. I assist Daniel with development, planning, and research. I delegate to specialized subagents via DeerFlow and accumulate knowledge over time.',
        'disposition': {'skepticism': 3, 'literalism': 4, 'empathy': 2, 'bias_strength': 0.2}
    }
    r = await _client.put(HINDSIGHT_BASE + '/banks/' + VESPER_BANK, json=payload)
    r.raise_for_status()
    return r.json()

async def retain(content: str, event_date=None, metadata=None) -> dict:
    item = {'content': content}
    if event_date:
        item['timestamp'] = event_date
    if metadata:
        item['metadata'] = metadata
    payload = {'items': [item]}
    r = await _client.post(HINDSIGHT_BASE + '/banks/' + VESPER_BANK + '/memories', json=payload)
    r.raise_for_status()
    return r.json()

async def search(query: str, limit: int = 10) -> str:
    r = await _client.post(HINDSIGHT_BASE + '/banks/' + VESPER_BANK + '/memories/recall', json={'query': query, 'limit': limit})
    r.raise_for_status()
    response = r.json()
    results = response.get('results', []) if isinstance(response, dict) else response
    if not results:
        return ''
    sep = chr(10) + '---' + chr(10)
    parts = []
    for item in results:
        parts.append(item.get('content') or item.get('text') or str(item))
    return sep.join(parts)

async def search_memories(query: str, num_results: int = 10) -> str:
    return await search(query, limit=num_results)

async def reflect(query: str) -> str:
    r = await _client.post(HINDSIGHT_BASE + '/banks/' + VESPER_BANK + '/reflect', json={'query': query})
    r.raise_for_status()
    result = r.json()
    return result.get('answer') or result.get('reflection') or result.get('content') or str(result)

async def init():
    bank = await _init_bank()
    print('VESPER bank ready: ' + str(bank.get('bank_id') or bank.get('id') or 'vesper'))
    return bank

if __name__ == '__main__':
    asyncio.run(init())
