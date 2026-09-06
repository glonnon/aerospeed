import { describe, expect, it } from 'vitest';
import '../src/content/ns.js';
import '../src/content/llm.js';

const DS = globalThis.DedupeStrava;

const res = (ok, status, body) => ({ ok, status, json: async () => body });

describe('llm.testConnection', () => {
  it('reports an Ollama endpoint with model counts', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return res(true, 200, { models: [{ name: 'qwen2.5:3b' }, { name: 'llama3:8b' }] });
    };
    const r = await DS.llm.testConnection({ mode: 'ollama', llmUrl: 'http://localhost:11434/', fetchImpl });
    expect(calls[0]).toBe('http://localhost:11434/api/tags');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('qwen2.5:3b');
  });

  it('reports an Ollama HTTP error', async () => {
    const r = await DS.llm.testConnection({ mode: 'ollama', llmUrl: 'http://localhost:11434', fetchImpl: async () => res(false, 500, {}) });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('500');
  });

  it('hits /models for OpenAI-compatible endpoints and lists them', async () => {
    const calls = [];
    const headers = {};
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return res(true, 200, { data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] });
    };
    const r = await DS.llm.testConnection({
      mode: 'openai',
      llmBaseUrl: 'https://api.openai.com/v1',
      llmApiKey: 'sk-test',
      fetchImpl
    });
    expect(calls[0].url).toBe('https://api.openai.com/v1/models');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('gpt-4o-mini');
  });

  it('works without an API key (sends no Authorization header)', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return res(true, 200, { data: [{ id: 'local-model' }] });
    };
    const r = await DS.llm.testConnection({
      mode: 'openai',
      llmBaseUrl: 'http://localhost:1234/v1',
      llmApiKey: '',
      fetchImpl
    });
    expect(calls[0].url).toBe('http://localhost:1234/v1/models');
    expect(calls[0].init.headers.Authorization).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('flags a non-ok endpoint status', async () => {
    const r = await DS.llm.testConnection({ mode: 'openai', llmBaseUrl: 'https://api.openai.com/v1', fetchImpl: async () => res(false, 401, {}) });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('401');
  });

  it('reports WebGPU availability without making a network call', async () => {
    const r = await DS.llm.testConnection({ mode: 'webgpu' });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/WebGPU/i);
  });

  it('reports when the AI is off', async () => {
    const r = await DS.llm.testConnection({ mode: 'off', fetchImpl: async () => res(true, 200, {}) });
    expect(r.ok).toBe(false);
  });
});