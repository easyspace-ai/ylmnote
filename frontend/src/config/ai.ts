// AI 模型配置

const getEnv = (key: string) => (import.meta as any).env?.[key]

export const AI_CONFIG = {
  // OpenRouter API
  openRouter: {
    baseUrl: getEnv('VITE_API_BASE_URL') || 'https://openrouter.ai/api/v1',
    apiKey: getEnv('VITE_OPENROUTER_API_KEY') || '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',
    defaultModel: getEnv('VITE_DEFAULT_MODEL') || 'openrouter/google/gemini-3-pro-preview',
    fallbackModel: getEnv('VITE_FALLBACK_MODEL') || 'openrouter/google/gemini-3-flash-preview',
  },
  
  // 可用模型列表
      models: [
      {
        id: 'moonshot/kimi-k2.5',
        name: 'Kimi (Moonshot) 2.5',
        description: '超长文本逻辑之王 默认模型',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/z-ai/glm-5',
        name: 'GLM 5',
        description: '智谱 AI 新一代引擎',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/minimax/minimax-m2.5',
        name: 'MiniMax 2.5',
        description: 'MiniMax 高频全能版',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/qwen/qwen3.5-plus-02-15',
        name: 'Qwen 3.5 Plus',
        description: '通义千问高效推理',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/bodybuilder',
        name: 'Body Builder (beta)',
        description: 'Transform your natural language requests...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/auto',
        name: 'Auto Router',
        description: 'Your prompt will be processed by a meta-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openrouter/free',
        name: 'Free Models Router',
        description: 'The simplest way to get free inference. ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'stepfun/step-3.5-flash:free',
        name: 'StepFun: Step 3.5 Flash (free)',
        description: 'Step 3.5 Flash is StepFun\'s most capable...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/trinity-large-preview:free',
        name: 'Arcee AI: Trinity Large Preview (free)',
        description: 'Trinity-Large-Preview is a frontier-scal...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'upstage/solar-pro-3:free',
        name: 'Upstage: Solar Pro 3 (free)',
        description: 'Solar Pro 3 is Upstage\'s powerful Mixtur...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'liquid/lfm-2.5-1.2b-thinking:free',
        name: 'LiquidAI: LFM2.5-1.2B-Thinking (free)',
        description: 'LFM2.5-1.2B-Thinking is a lightweight re...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'liquid/lfm-2.5-1.2b-instruct:free',
        name: 'LiquidAI: LFM2.5-1.2B-Instruct (free)',
        description: 'LFM2.5-1.2B-Instruct is a compact, high-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-3-nano-30b-a3b:free',
        name: 'NVIDIA: Nemotron 3 Nano 30B A3B (free)',
        description: 'NVIDIA Nemotron 3 Nano 30B A3B is a smal...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/trinity-mini:free',
        name: 'Arcee AI: Trinity Mini (free)',
        description: 'Trinity Mini is a 26B-parameter (3B acti...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-nano-12b-v2-vl:free',
        name: 'NVIDIA: Nemotron Nano 12B 2 VL (free)',
        description: 'NVIDIA Nemotron Nano 2 VL is a 12-billio...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-30b-a3b-thinking',
        name: 'Qwen: Qwen3 VL 30B A3B Thinking',
        description: 'Qwen3-VL-30B-A3B-Thinking is a multimoda...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-235b-a22b-thinking',
        name: 'Qwen: Qwen3 VL 235B A22B Thinking',
        description: 'Qwen3-VL-235B-A22B Thinking is a multimo...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-next-80b-a3b-instruct:free',
        name: 'Qwen: Qwen3 Next 80B A3B Instruct (free)',
        description: 'Qwen3-Next-80B-A3B-Instruct is an instru...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-nano-9b-v2:free',
        name: 'NVIDIA: Nemotron Nano 9B V2 (free)',
        description: 'NVIDIA-Nemotron-Nano-9B-v2 is a large la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-120b:free',
        name: 'OpenAI: gpt-oss-120b (free)',
        description: 'gpt-oss-120b is an open-weight, 117B-par...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-20b:free',
        name: 'OpenAI: gpt-oss-20b (free)',
        description: 'gpt-oss-20b is an open-weight 21B parame...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4.5-air:free',
        name: 'Z.ai: GLM 4.5 Air (free)',
        description: 'GLM-4.5-Air is the lightweight variant o...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-235b-a22b-thinking-2507',
        name: 'Qwen: Qwen3 235B A22B Thinking 2507',
        description: 'Qwen3-235B-A22B-Thinking-2507 is a high-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-coder:free',
        name: 'Qwen: Qwen3 Coder 480B A35B (free)',
        description: 'Qwen3-Coder-480B-A35B-Instruct is a Mixt...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
        name: 'Venice: Uncensored (free)',
        description: 'Venice Uncensored Dolphin Mistral 24B Ve...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3n-e2b-it:free',
        name: 'Google: Gemma 3n 2B (free)',
        description: 'Gemma 3n E2B IT is a multimodal, instruc...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3n-e4b-it:free',
        name: 'Google: Gemma 3n 4B (free)',
        description: 'Gemma 3n E4B-it is optimized for efficie...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-4b:free',
        name: 'Qwen: Qwen3 4B (free)',
        description: 'Qwen3-4B is a 4 billion parameter dense ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-small-3.1-24b-instruct:free',
        name: 'Mistral: Mistral Small 3.1 24B (free)',
        description: 'Mistral Small 3.1 24B Instruct is an upg...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-4b-it:free',
        name: 'Google: Gemma 3 4B (free)',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-12b-it:free',
        name: 'Google: Gemma 3 12B (free)',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-27b-it:free',
        name: 'Google: Gemma 3 27B (free)',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct:free',
        name: 'Meta: Llama 3.3 70B Instruct (free)',
        description: 'The Meta Llama 3.3 multilingual large la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.2-3b-instruct:free',
        name: 'Meta: Llama 3.2 3B Instruct (free)',
        description: 'Llama 3.2 3B is a 3-billion-parameter mu...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nousresearch/hermes-3-llama-3.1-405b:free',
        name: 'Nous: Hermes 3 405B Instruct (free)',
        description: 'Hermes 3 is a generalist language model ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'liquid/lfm2-8b-a1b',
        name: 'LiquidAI: LFM2-8B-A1B',
        description: 'LFM2-8B-A1B is an efficient on-device Mi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'liquid/lfm-2.2-6b',
        name: 'LiquidAI: LFM2-2.6B',
        description: 'LFM2 is a new generation of hybrid model...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.2-3b-instruct',
        name: 'Meta: Llama 3.2 3B Instruct',
        description: 'Llama 3.2 3B is a 3-billion-parameter mu...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3n-e4b-it',
        name: 'Google: Gemma 3n 4B',
        description: 'Gemma 3n E4B-it is optimized for efficie...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-nemo',
        name: 'Mistral: Mistral Nemo',
        description: 'A 12B parameter model with a 128k token ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Meta: Llama 3.1 8B Instruct',
        description: 'Meta\'s latest class of model (Llama 3.1)...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3-8b-instruct',
        name: 'Meta: Llama 3 8B Instruct',
        description: 'Meta\'s latest class of model (Llama 3) l...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-guard-3-8b',
        name: 'Llama Guard 3 8B',
        description: 'Llama Guard 3 is a Llama-3.1-8B pretrain...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'sao10k/l3-lunaris-8b',
        name: 'Sao10K: Llama 3 8B Lunaris',
        description: 'Lunaris 8B is a versatile generalist and...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.2-11b-vision-instruct',
        name: 'Meta: Llama 3.2 11B Vision Instruct',
        description: 'Llama 3.2 11B Vision is a multimodal mod...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen2.5-coder-7b-instruct',
        name: 'Qwen: Qwen2.5 Coder 7B Instruct',
        description: 'Qwen2.5-Coder-7B-Instruct is a 7B parame...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-2-9b-it',
        name: 'Google: Gemma 2 9B',
        description: 'Gemma 2 9B by Google is an advanced, ope...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'gryphe/mythomax-l2-13b',
        name: 'MythoMax 13B',
        description: 'One of the highest performing and most p...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-4b-it',
        name: 'Google: Gemma 3 4B',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'ibm-granite/granite-4.0-h-micro',
        name: 'IBM: Granite 4.0 Micro',
        description: 'Granite-4.0-H-Micro is a 3B parameter fr...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-small-24b-instruct-2501',
        name: 'Mistral: Mistral Small 3',
        description: 'Mistral Small 3 is a 24B-parameter langu...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-2.5-7b-instruct',
        name: 'Qwen: Qwen2.5 7B Instruct',
        description: 'Qwen2.5 7B is the latest series of Qwen ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-20b',
        name: 'OpenAI: gpt-oss-20b',
        description: 'gpt-oss-20b is an open-weight 21B parame...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-12b-it',
        name: 'Google: Gemma 3 12B',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-235b-a22b-2507',
        name: 'Qwen: Qwen3 235B A22B Instruct 2507',
        description: 'Qwen3-235B-A22B-Instruct-2507 is a multi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'amazon/nova-micro-v1',
        name: 'Amazon: Nova Micro 1.0',
        description: 'Amazon Nova Micro 1.0 is a text-only mod...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'cohere/command-r7b-12-2024',
        name: 'Cohere: Command R7B (12-2024)',
        description: 'Command R7B (12-2024) is a small, fast u...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-3-27b-it',
        name: 'Google: Gemma 3 27B',
        description: 'Gemma 3 introduces multimodality, suppor...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/trinity-mini',
        name: 'Arcee AI: Trinity Mini',
        description: 'Trinity Mini is a 26B-parameter (3B acti...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/ministral-3b-2512',
        name: 'Mistral: Ministral 3 3B 2512',
        description: 'The smallest model in the Ministral 3 fa...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-nano-9b-v2',
        name: 'NVIDIA: Nemotron Nano 9B V2',
        description: 'NVIDIA-Nemotron-Nano-9B-v2 is a large la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4-32b',
        name: 'Z.ai: GLM 4 32B ',
        description: 'GLM 4 32B is a cost-effective foundation...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'microsoft/phi-4',
        name: 'Microsoft: Phi 4',
        description: '[Microsoft Research](/microsoft) Phi-4 i...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.2-1b-instruct',
        name: 'Meta: Llama 3.2 1B Instruct',
        description: 'Llama 3.2 1B is a 1-billion-parameter la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-120b',
        name: 'OpenAI: gpt-oss-120b',
        description: 'gpt-oss-120b is an open-weight, 117B-par...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-120b:exacto',
        name: 'OpenAI: gpt-oss-120b (exacto)',
        description: 'gpt-oss-120b is an open-weight, 117B-par...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-small-3.2-24b-instruct',
        name: 'Mistral: Mistral Small 3.2 24B',
        description: 'Mistral-Small-3.2-24B-Instruct-2506 is a...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-3-nano-30b-a3b',
        name: 'NVIDIA: Nemotron 3 Nano 30B A3B',
        description: 'NVIDIA Nemotron 3 Nano 30B A3B is a smal...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-2-0325-32b-instruct',
        name: 'AllenAI: Olmo 2 32B Instruct',
        description: 'OLMo-2 32B Instruct is a supervised inst...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-turbo',
        name: 'Qwen: Qwen-Turbo',
        description: 'Qwen-Turbo, based on Qwen2.5, is a 1M co...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/nemotron-nano-12b-v2-vl',
        name: 'NVIDIA: Nemotron Nano 12B 2 VL',
        description: 'NVIDIA Nemotron Nano 2 VL is a 12-billio...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nousresearch/hermes-2-pro-llama-3-8b',
        name: 'NousResearch: Hermes 2 Pro - Llama-3 8B',
        description: 'Hermes 2 Pro is an upgraded, retrained v...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'essentialai/rnj-1-instruct',
        name: 'EssentialAI: Rnj 1 Instruct',
        description: 'Rnj-1 is an 8B-parameter, dense, open-we...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/ministral-8b-2512',
        name: 'Mistral: Ministral 3 8B 2512',
        description: 'A balanced model in the Ministral 3 fami...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-3-7b-instruct',
        name: 'AllenAI: Olmo 3 7B Instruct',
        description: 'Olmo 3 7B Instruct is a supervised instr...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'bytedance/ui-tars-1.5-7b',
        name: 'ByteDance: UI-TARS 7B ',
        description: 'UI-TARS-1.5 is a multimodal vision-langu...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-14b',
        name: 'Qwen: Qwen3 14B',
        description: 'Qwen3-14B is a dense 14.8B parameter cau...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'amazon/nova-lite-v1',
        name: 'Amazon: Nova Lite 1.0',
        description: 'Amazon Nova Lite 1.0 is a very low-cost ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-7b-instruct-v0.1',
        name: 'Mistral: Mistral 7B Instruct v0.1',
        description: 'A 7.3B parameter model that outperforms ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-3-7b-think',
        name: 'AllenAI: Olmo 3 7B Think',
        description: 'Olmo 3 7B Think is a research-oriented l...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-32b',
        name: 'Qwen: Qwen3 32B',
        description: 'Qwen3-32B is a dense 32.8B parameter cau...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-coder-30b-a3b-instruct',
        name: 'Qwen: Qwen3 Coder 30B A3B Instruct',
        description: 'Qwen3-Coder-30B-A3B-Instruct is a 30.5B ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'baidu/ernie-4.5-21b-a3b-thinking',
        name: 'Baidu: ERNIE 4.5 21B A3B Thinking',
        description: 'ERNIE-4.5-21B-A3B-Thinking is Baidu\'s up...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'baidu/ernie-4.5-21b-a3b',
        name: 'Baidu: ERNIE 4.5 21B A3B',
        description: 'A sophisticated text-based Mixture-of-Ex...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/spotlight',
        name: 'Arcee AI: Spotlight',
        description: 'Spotlight is a 7‑billion‑parameter visio...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-guard-4-12b',
        name: 'Meta: Llama Guard 4 12B',
        description: 'Llama Guard 4 is a Llama 4 Scout-derived...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-30b-a3b',
        name: 'Qwen: Qwen3 30B A3B',
        description: 'Qwen3, the latest generation in the Qwen...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'bytedance-seed/seed-1.6-flash',
        name: 'ByteDance Seed: Seed 1.6 Flash',
        description: 'Seed 1.6 Flash is an ultra-fast multimod...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-oss-safeguard-20b',
        name: 'OpenAI: gpt-oss-safeguard-20b',
        description: 'gpt-oss-safeguard-20b is a safety reason...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemini-2.0-flash-lite-001',
        name: 'Google: Gemini 2.0 Flash Lite',
        description: 'Gemini 2.0 Flash Lite offers a significa...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'xiaomi/mimo-v2-flash',
        name: 'Xiaomi: MiMo-V2-Flash',
        description: 'MiMo-V2-Flash is an open-source foundati...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-4-scout',
        name: 'Meta: Llama 4 Scout',
        description: 'Llama 4 Scout 17B Instruct (16E) is a mi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-30b-a3b-instruct-2507',
        name: 'Qwen: Qwen3 30B A3B Instruct 2507',
        description: 'Qwen3-30B-A3B-Instruct-2507 is a 30.5B-p...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-30b-a3b-thinking-2507',
        name: 'Qwen: Qwen3 30B A3B Thinking 2507',
        description: 'Qwen3-30B-A3B-Thinking-2507 is a 30B par...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'stepfun/step-3.5-flash',
        name: 'StepFun: Step 3.5 Flash',
        description: 'Step 3.5 Flash is StepFun\'s most capable...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/molmo-2-8b',
        name: 'AllenAI: Molmo2 8B',
        description: 'Molmo2-8B is an open vision-language mod...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-small-creative',
        name: 'Mistral: Mistral Small Creative',
        description: 'Mistral Small Creative is an experimenta...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/ministral-14b-2512',
        name: 'Mistral: Ministral 3 14B 2512',
        description: 'The largest model in the Ministral 3 fam...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/voxtral-small-24b-2507',
        name: 'Mistral: Voxtral Small 24B 2507',
        description: 'Voxtral Small is an enhancement of Mistr...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/devstral-small',
        name: 'Mistral: Devstral Small 1.1',
        description: 'Devstral Small 1.1 is a 24B parameter op...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-2.5-coder-32b-instruct',
        name: 'Qwen2.5 Coder 32B Instruct',
        description: 'Qwen2.5-Coder is the latest series of Co...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-2.5-vl-7b-instruct',
        name: 'Qwen: Qwen2.5-VL 7B Instruct',
        description: 'Qwen2.5 VL 7B is a multimodal LLM from t...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-7b-instruct',
        name: 'Mistral: Mistral 7B Instruct',
        description: 'A high-performing, industry-standard 7.3...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-7b-instruct-v0.3',
        name: 'Mistral: Mistral 7B Instruct v0.3',
        description: 'A high-performing, industry-standard 7.3...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-guard-2-8b',
        name: 'Meta: LlamaGuard 2 8B',
        description: 'This safeguard model has 8B parameters a...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-7b-instruct-v0.2',
        name: 'Mistral: Mistral 7B Instruct v0.2',
        description: 'A high-performing, industry-standard 7.3...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        name: 'Meta: Llama 3.3 70B Instruct',
        description: 'The Meta Llama 3.3 multilingual large la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-5-nano',
        name: 'OpenAI: GPT-5 Nano',
        description: 'GPT-5-Nano is the smallest and fastest v...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-8b',
        name: 'Qwen: Qwen3 8B',
        description: 'Qwen3-8B is a dense 8.2B parameter causa...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4.7-flash',
        name: 'Z.ai: GLM 4.7 Flash',
        description: 'As a 30B-class SOTA model, GLM-4.7-Flash...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        name: 'NVIDIA: Llama 3.3 Nemotron Super 49B V1.5',
        description: 'Llama-3.3-Nemotron-Super-49B-v1.5 is a 4...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemini-2.5-flash-lite-preview-09-2025',
        name: 'Google: Gemini 2.5 Flash Lite Preview 09-2025',
        description: 'Gemini 2.5 Flash-Lite is a lightweight r...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemini-2.5-flash-lite',
        name: 'Google: Gemini 2.5 Flash Lite',
        description: 'Gemini 2.5 Flash-Lite is a lightweight r...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-4.1-nano',
        name: 'OpenAI: GPT-4.1 Nano',
        description: 'For tasks that demand low latency, GPT‑4...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemini-2.0-flash-001',
        name: 'Google: Gemini 2.0 Flash',
        description: 'Gemini Flash 2.0 offers a significantly ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-2.5-72b-instruct',
        name: 'Qwen2.5 72B Instruct',
        description: 'Qwen2.5 72B is the latest series of Qwen...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-32b-instruct',
        name: 'Qwen: Qwen3 VL 32B Instruct',
        description: 'Qwen3-VL-32B-Instruct is a large-scale m...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nousresearch/hermes-4-70b',
        name: 'Nous: Hermes 4 70B',
        description: 'Hermes 4 70B is a hybrid reasoning model...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'alibaba/tongyi-deepresearch-30b-a3b',
        name: 'Tongyi DeepResearch 30B A3B',
        description: 'Tongyi DeepResearch is an agentic large ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwq-32b',
        name: 'Qwen: QwQ 32B',
        description: 'QwQ is the reasoning model of the Qwen s...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-8b-instruct',
        name: 'Qwen: Qwen3 VL 8B Instruct',
        description: 'Qwen3-VL-8B-Instruct is a multimodal vis...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-r1-distill-qwen-32b',
        name: 'DeepSeek: R1 Distill Qwen 32B',
        description: 'DeepSeek R1 Distill Qwen 32B is a distil...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'thedrummer/rocinante-12b',
        name: 'TheDrummer: Rocinante 12B',
        description: 'Rocinante 12B is designed for engaging s...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nousresearch/hermes-3-llama-3.1-70b',
        name: 'Nous: Hermes 3 70B Instruct',
        description: 'Hermes 3 is a generalist language model ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-3.1-32b-think',
        name: 'AllenAI: Olmo 3.1 32B Think',
        description: 'Olmo 3.1 32B Think is a large-scale, 32-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-v3.2',
        name: 'DeepSeek: DeepSeek V3.2',
        description: 'DeepSeek-V3.2 is a large language model ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-3-32b-think',
        name: 'AllenAI: Olmo 3 32B Think',
        description: 'Olmo 3 32B Think is a large-scale, 32-bi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-30b-a3b-instruct',
        name: 'Qwen: Qwen3 VL 30B A3B Instruct',
        description: 'Qwen3-VL-30B-A3B-Instruct is a multimoda...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-v3.2-exp',
        name: 'DeepSeek: DeepSeek V3.2 Exp',
        description: 'DeepSeek-V3.2-Exp is an experimental lar...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'neversleep/llama-3.1-lumimaid-8b',
        name: 'NeverSleep: Lumimaid v0.2 8B',
        description: 'Lumimaid v0.2 8B is a finetune of [Llama...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'x-ai/grok-4.1-fast',
        name: 'xAI: Grok 4.1 Fast',
        description: 'Grok 4.1 Fast is xAI\'s best agentic tool...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'x-ai/grok-4-fast',
        name: 'xAI: Grok 4 Fast',
        description: 'Grok 4 Fast is xAI\'s latest multimodal m...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'baidu/ernie-4.5-vl-28b-a3b',
        name: 'Baidu: ERNIE 4.5 VL 28B A3B',
        description: 'A powerful multimodal Mixture-of-Experts...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'tencent/hunyuan-a13b-instruct',
        name: 'Tencent: Hunyuan A13B Instruct',
        description: 'Hunyuan-A13B is a 13B active parameter M...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'opengvlab/internvl3-78b',
        name: 'OpenGVLab: InternVL3 78B',
        description: 'The InternVL3 series is an advanced mult...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-4-maverick',
        name: 'Meta: Llama 4 Maverick',
        description: 'Llama 4 Maverick 17B Instruct (128E) is ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-4o-mini-search-preview',
        name: 'OpenAI: GPT-4o-mini Search Preview',
        description: 'GPT-4o mini Search Preview is a speciali...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'cohere/command-r-08-2024',
        name: 'Cohere: Command R (08-2024)',
        description: 'command-r-08-2024 is an update of the [C...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-4o-mini-2024-07-18',
        name: 'OpenAI: GPT-4o-mini (2024-07-18)',
        description: 'GPT-4o mini is OpenAI\'s newest model aft...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-4o-mini',
        name: 'OpenAI: GPT-4o-mini',
        description: 'GPT-4o mini is OpenAI\'s newest model aft...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'allenai/olmo-3.1-32b-instruct',
        name: 'AllenAI: Olmo 3.1 32B Instruct',
        description: 'Olmo 3.1 32B Instruct is a large-scale, ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'thedrummer/cydonia-24b-v4.1',
        name: 'TheDrummer: Cydonia 24B V4.1',
        description: 'Uncensored and creative writing model ba...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'x-ai/grok-3-mini',
        name: 'xAI: Grok 3 Mini',
        description: 'A lightweight model that thinks before r...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'x-ai/grok-3-mini-beta',
        name: 'xAI: Grok 3 Mini Beta',
        description: 'Grok 3 Mini is a lightweight, smaller th...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen2.5-vl-32b-instruct',
        name: 'Qwen: Qwen2.5 VL 32B Instruct',
        description: 'Qwen2.5-VL-32B is a multimodal vision-la...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-saba',
        name: 'Mistral: Saba',
        description: 'Mistral Saba is a 24B-parameter language...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'thedrummer/unslopnemo-12b',
        name: 'TheDrummer: UnslopNemo 12B',
        description: 'UnslopNemo v4.1 is the latest addition f...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Meta: Llama 3.1 70B Instruct',
        description: 'Meta\'s latest class of model (Llama 3.1)...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-vl-plus',
        name: 'Qwen: Qwen VL Plus',
        description: 'Qwen\'s Enhanced Large Visual Language Mo...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-coder-next',
        name: 'Qwen: Qwen3 Coder Next',
        description: 'Qwen3-Coder-Next is an open-weight causa...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-chat-v3.1',
        name: 'DeepSeek: DeepSeek V3.1',
        description: 'DeepSeek-V3.1 is a large hybrid reasonin...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-small-3.1-24b-instruct',
        name: 'Mistral: Mistral Small 3.1 24B',
        description: 'Mistral Small 3.1 24B Instruct is an upg...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4.5-air',
        name: 'Z.ai: GLM 4.5 Air',
        description: 'GLM-4.5-Air is the lightweight variant o...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-v3.1-terminus:exacto',
        name: 'DeepSeek: DeepSeek V3.1 Terminus (exacto)',
        description: 'DeepSeek-V3.1 Terminus is an update to [...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-v3.1-terminus',
        name: 'DeepSeek: DeepSeek V3.1 Terminus',
        description: 'DeepSeek-V3.1 Terminus is an update to [...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meituan/longcat-flash-chat',
        name: 'Meituan: LongCat Flash Chat',
        description: 'LongCat-Flash-Chat is a large-scale Mixt...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'kwaipilot/kat-coder-pro',
        name: 'Kwaipilot: KAT-Coder-Pro V1',
        description: 'KAT-Coder-Pro V1 is KwaiKAT\'s most advan...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-chat-v3-0324',
        name: 'DeepSeek: DeepSeek V3 0324',
        description: 'DeepSeek V3, a 685B-parameter, mixture-o...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-235b-a22b-instruct',
        name: 'Qwen: Qwen3 VL 235B A22B Instruct',
        description: 'Qwen3-VL-235B-A22B Instruct is an open-w...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mixtral-8x7b-instruct',
        name: 'Mistral: Mixtral 8x7B Instruct',
        description: 'Mixtral 8x7B Instruct is a pretrained ge...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'tngtech/deepseek-r1t2-chimera',
        name: 'TNG: DeepSeek R1T2 Chimera',
        description: 'DeepSeek-TNG-R1T2-Chimera is the second-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'undi95/remm-slerp-l2-13b',
        name: 'ReMM SLERP 13B',
        description: 'A recreation trial of the original Mytho...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-next-80b-a3b-instruct',
        name: 'Qwen: Qwen3 Next 80B A3B Instruct',
        description: 'Qwen3-Next-80B-A3B-Instruct is an instru...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4.6v',
        name: 'Z.ai: GLM 4.6V',
        description: 'GLM-4.6V is a large multimodal model des...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/codestral-2508',
        name: 'Mistral: Codestral 2508',
        description: 'Mistral\'s cutting-edge language model fo...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-chat',
        name: 'DeepSeek: DeepSeek V3',
        description: 'DeepSeek-V3 is the latest model from the...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'minimax/minimax-m2.1',
        name: 'MiniMax: MiniMax M2.1',
        description: 'MiniMax-M2.1 is a lightweight, state-of-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-coder',
        name: 'Qwen: Qwen3 Coder 480B A35B',
        description: 'Qwen3-Coder-480B-A35B-Instruct is a Mixt...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'microsoft/wizardlm-2-8x22b',
        name: 'WizardLM-2 8x22B',
        description: 'WizardLM-2 8x22B is Microsoft AI\'s most ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'inception/mercury',
        name: 'Inception: Mercury',
        description: 'Mercury is the first diffusion large lan...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'inception/mercury-coder',
        name: 'Inception: Mercury Coder',
        description: 'Mercury Coder is the first diffusion lar...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'meta-llama/llama-3-70b-instruct',
        name: 'Meta: Llama 3 70B Instruct',
        description: 'Meta\'s latest class of model (Llama 3) l...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'minimax/minimax-m2',
        name: 'MiniMax: MiniMax M2',
        description: 'MiniMax-M2 is a compact, high-efficiency...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'nex-agi/deepseek-v3.1-nex-n1',
        name: 'Nex AGI: DeepSeek V3.1 Nex N1',
        description: 'DeepSeek V3.1 Nex-N1 is the flagship rel...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/coder-large',
        name: 'Arcee AI: Coder Large',
        description: 'Coder‑Large is a 32 B‑parameter offsprin...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'prime-intellect/intellect-3',
        name: 'Prime Intellect: INTELLECT-3',
        description: 'INTELLECT-3 is a 106B-parameter Mixture-...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'minimax/minimax-01',
        name: 'MiniMax: MiniMax-01',
        description: 'MiniMax-01 is a combines MiniMax-Text-01...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'google/gemma-2-27b-it',
        name: 'Google: Gemma 2 27B',
        description: 'Gemma 2 27B by Google is an open model b...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-next-80b-a3b-thinking',
        name: 'Qwen: Qwen3 Next 80B A3B Thinking',
        description: 'Qwen3-Next-80B-A3B-Thinking is a reasoni...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'thedrummer/skyfall-36b-v2',
        name: 'TheDrummer: Skyfall 36B V2',
        description: 'Skyfall 36B v2 is an enhanced iteration ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'baidu/ernie-4.5-300b-a47b',
        name: 'Baidu: ERNIE 4.5 300B A47B ',
        description: 'ERNIE-4.5-300B-A47B is a 300B parameter ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'minimax/minimax-m2.5',
        name: 'MiniMax: MiniMax M2.5',
        description: 'MiniMax-M2.5 is a SOTA large language mo...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'sao10k/l3.3-euryale-70b',
        name: 'Sao10K: Llama 3.3 Euryale 70B',
        description: 'Euryale L3.3 70B is a model focused on c...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'sao10k/l3.1-euryale-70b',
        name: 'Sao10K: Llama 3.1 Euryale 70B v2.2',
        description: 'Euryale L3.1 70B v2.2 is a model focused...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-vl-8b-thinking',
        name: 'Qwen: Qwen3 VL 8B Thinking',
        description: 'Qwen3-VL-8B-Thinking is the reasoning-op...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'minimax/minimax-m2-her',
        name: 'MiniMax: MiniMax M2-her',
        description: 'MiniMax M2-her is a dialogue-first large...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-r1-distill-llama-70b',
        name: 'DeepSeek: R1 Distill Llama 70B',
        description: 'DeepSeek R1 Distill Llama 70B is a disti...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'anthropic/claude-3-haiku',
        name: 'Anthropic: Claude 3 Haiku',
        description: 'Claude 3 Haiku is Anthropic\'s fastest an...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'deepseek/deepseek-v3.2-speciale',
        name: 'DeepSeek: DeepSeek V3.2 Speciale',
        description: 'DeepSeek-V3.2-Speciale is a high-compute...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-plus-2025-07-28',
        name: 'Qwen: Qwen Plus 0728',
        description: 'Qwen Plus 0728, based on the Qwen3 found...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-plus-2025-07-28:thinking',
        name: 'Qwen: Qwen Plus 0728 (thinking)',
        description: 'Qwen Plus 0728, based on the Qwen3 found...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen2.5-vl-72b-instruct',
        name: 'Qwen: Qwen2.5 VL 72B Instruct',
        description: 'Qwen2.5-VL is proficient in recognizing ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen-plus',
        name: 'Qwen: Qwen-Plus',
        description: 'Qwen-Plus, based on the Qwen2.5 foundati...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'baidu/ernie-4.5-vl-424b-a47b',
        name: 'Baidu: ERNIE 4.5 VL 424B A47B ',
        description: 'ERNIE-4.5-VL-424B-A47B is a multimodal M...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'z-ai/glm-4.7',
        name: 'Z.ai: GLM 4.7',
        description: 'GLM-4.7 is Z.ai’s latest flagship model,...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'x-ai/grok-code-fast-1',
        name: 'xAI: Grok Code Fast 1',
        description: 'Grok Code Fast 1 is a speedy and economi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mancer/weaver',
        name: 'Mancer: Weaver (alpha)',
        description: 'An attempt to recreate Claude-style verb...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'qwen/qwen3-coder-flash',
        name: 'Qwen: Qwen3 Coder Flash',
        description: 'Qwen3 Coder Flash is Alibaba\'s fast and ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'arcee-ai/virtuoso-large',
        name: 'Arcee AI: Virtuoso Large',
        description: 'Virtuoso‑Large is Arcee\'s top‑tier gener...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'mistralai/mistral-large-2512',
        name: 'Mistral: Mistral Large 3 2512',
        description: 'Mistral Large 3 2512 is Mistral’s most c...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'morph/morph-v3-fast',
        name: 'Morph: Morph V3 Fast',
        description: 'Morph\'s fastest apply model for code edi...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'openai/gpt-4.1-mini',
        name: 'OpenAI: GPT-4.1 Mini',
        description: 'GPT-4.1 Mini is a mid-sized model delive...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'eleutherai/llemma_7b',
        name: 'EleutherAI: Llemma 7b',
        description: 'Llemma 7B is a language model for mathem...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'alfredpros/codellama-7b-instruct-solidity',
        name: 'AlfredPros: CodeLLaMa 7B Instruct Solidity',
        description: 'A finetuned 7 billion parameters Code LL...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
      {
        id: 'perplexity/sonar',
        name: 'Perplexity: Sonar',
        description: 'Sonar is lightweight, affordable, fast, ...',
        provider: 'OpenRouter',
        maxTokens: 8192
      },
    ],
    defaultModelId: 'moonshot/kimi-k2.5'
}

// 获取模型配置
export function getModelConfig(modelId?: string) {
  const id = modelId || AI_CONFIG.defaultModelId
  return AI_CONFIG.models.find(m => m.id === id) || AI_CONFIG.models[0]
}
