type AIOptsType = {
    default: "openai" | "azure" | "gemini";
    gemini?: GeminiOptsType;
    openai?: OpenAIOptsType;
    azure?: AzureOpenAIOptsType;
};

type GeminiOptsType = {
    model?: string;
    apitoken?: string;
    maxtokens?: number;
    connectionstatus?: string;
    enabled?: boolean;
};

type AzureOpenAIOptsType = {
    baseurl?: string;
    deploymentname?: string;
    apitoken?: string;
    connectionstatus?: string;
    enabled?: boolean;
};

type OpenAIOptsType = {
    model?: string;
    apitoken?: string;
    maxtokens?: number;
    maxchoices?: number;
    baseurl?: string;
    timeout?: number;
    connectionstatus?: string;
    enabled?: boolean;
};