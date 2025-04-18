import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import OpenAI from "openai";
import { Tool, Resource } from "@modelcontextprotocol/sdk/types.js";
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.js";
import { createInterface } from "readline";
import { homedir } from 'os';
import config from "./mcp-server-config.js";

// 初始化环境变量
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY environment variable is required");
}
interface MCPToolResult {
    content: string | Array<{
        type: string;
        text?: string;
        data?: string;
        mimeType?: string;
    }>;
}
interface MCPResourceResult {
    contents: Array<{
        uri: string;
        mimeType: string;
        blob?: string;
        text?: string;
    }>;
}
interface ServerConfig {
    name: string;
    type: 'command' | 'sse';
    command?: string;
    url?: string;
    isOpen?: boolean;
}
export class MCPClient {
    static getOpenServers(): string[] {
        return config.filter(cfg => cfg.isOpen).map(cfg => cfg.name);
    }
    private sessions: Map<string, Client> = new Map();
    private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();
    private openai: OpenAI;
    private resources: Map<string, Map<string, Resource>> = new Map();
    
    constructor() {
        this.openai = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
    }
    
    async connectToServer(serverName: string): Promise<void> {
        const serverConfig = config.find(cfg => cfg.name === serverName) as ServerConfig;
        if (!serverConfig) {
            throw new Error(`Server configuration not found for: ${serverName}`);
        }
        let transport: StdioClientTransport | SSEClientTransport;
        if (serverConfig.type === 'command' && serverConfig.command) {
            transport = await this.createCommandTransport(serverConfig.command);
        } else if (serverConfig.type === 'sse' && serverConfig.url) {
            transport = await this.createSSETransport(serverConfig.url);
        } else {
            throw new Error(`Invalid server configuration for: ${serverName}`);
        }
        const client = new Client(
            {
                name: "mcp-client",
                version: "1.0.0"
            },
            {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {}
                }
            }
        );
        await client.connect(transport);
        
        this.sessions.set(serverName, client);
        this.transports.set(serverName, transport);
        
        // 列出可用工具
        const toolsResponse = await client.listTools();
        console.log(`\nConnected to server '${serverName}' with tools:`, toolsResponse.tools.map((tool: Tool) => tool.name));
        
        // 列出可用资源
        const resourcesResponse = await client.listResources();
        if (resourcesResponse.resources && resourcesResponse.resources.length > 0) {
            this.resources.set(serverName, new Map(
                resourcesResponse.resources.map(resource => [resource.name, resource])
            ));
            console.log(`Available resources on server '${serverName}':`, resourcesResponse.resources.map(resource => resource.name));
        } else {
            console.log(`No resources available on server '${serverName}'`);
            this.resources.set(serverName, new Map());
        }
    }
    
    private async createCommandTransport(shell: string): Promise<StdioClientTransport> {
        const [command, ...shellArgs] = shell.split(' ');
        if (!command) {
            throw new Error("Invalid shell command");
        }
        // 处理参数中的波浪号路径
        const args = shellArgs.map(arg => {
            if (arg.startsWith('~/')) {
                return arg.replace('~', homedir());
            }
            return arg;
        });
        
        const serverParams: StdioServerParameters = {
            command,
            args,
            env: Object.fromEntries(
                Object.entries(process.env).filter(([_, v]) => v !== undefined)
            ) as Record<string, string>
        };
        return new StdioClientTransport(serverParams);
    }
    
    private async createSSETransport(url: string): Promise<SSEClientTransport> {
        return new SSEClientTransport(new URL(url));
    }
    
    async listResources(serverName: string): Promise<Resource[]> {
        const resources = this.resources.get(serverName);
        if (!resources) {
            throw new Error(`No resources available for server: ${serverName}`);
        }
        return Array.from(resources.values());
    }
    
    async readResource(serverName: string, resourceName: string, params: Record<string, any>): Promise<MCPResourceResult> {
        const session = this.sessions.get(serverName);
        if (!session) {
            throw new Error(`No session found for server: ${serverName}`);
        }
        
        const resources = this.resources.get(serverName);
        if (!resources || !resources.has(resourceName)) {
            throw new Error(`Resource '${resourceName}' not found on server: ${serverName}`);
        }
        
        const resource = resources.get(resourceName)!;
        
        // Create a proper URI for the resource using server readResource API
        try {
            // Directly use the resource with resource name and parameters
            const result = await session.readResource({
                uri: `/${resourceName}`,
                parameters: params
            });
            
            return result as unknown as MCPResourceResult;
        } catch (error) {
            console.error(`Error reading resource ${resourceName}:`, error);
            throw error;
        }
    }
    
    async processQuery(query: string): Promise<string> {
        if (this.sessions.size === 0) {
            throw new Error("Not connected to any server");
        }
        const messages: ChatCompletionMessageParam[] = [
            {
                role: "user",
                content: query
            }
        ];
        // 获取所有服务器的工具和资源列表
        const availableTools: any[] = [];
        
        for (const [serverName, session] of this.sessions) {
            // 添加工具
            const toolsResponse = await session.listTools();
            const tools = toolsResponse.tools.map((tool: Tool) => ({
                type: "function" as const,
                function: {
                    name: `${serverName}__${tool.name}`,
                    description: `[${serverName}] ${tool.description}`,
                    parameters: tool.inputSchema
                }
            }));
            availableTools.push(...tools);
            
            // 添加资源列表功能
            availableTools.push({
                type: "function" as const,
                function: {
                    name: `${serverName}__listResources`,
                    description: `[${serverName}] List available resources on the server`,
                    parameters: {
                        type: "object",
                        properties: {},
                        required: []
                    }
                }
            });
            
            // 为每种资源添加读取功能
            const serverResources = this.resources.get(serverName);
            if (serverResources) {
                for (const [resourceName, resource] of serverResources) {
                    availableTools.push({
                        type: "function" as const,
                        function: {
                            name: `${serverName}__readResource__${resourceName}`,
                            description: `[${serverName}] Read resource: ${resourceName}`,
                            parameters: resource.parametersSchema || {
                                type: "object",
                                properties: {},
                                required: []
                            }
                        }
                    });
                }
            }
        }
        
        // 调用OpenAI API
        const completion = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages,
            tools: availableTools,
            tool_choice: "auto"
        });
        
        const finalText: string[] = [];
        
        // 处理OpenAI的响应
        for (const choice of completion.choices) {
            const message = choice.message;
            
            if (message.content) {
                finalText.push(message.content);
            }
            
            if (message.tool_calls) {
                for (const toolCall of message.tool_calls) {
                    const functionNameParts = toolCall.function.name.split('__');
                    const serverName = functionNameParts[0];
                    const functionType = functionNameParts[1];
                    const session = this.sessions.get(serverName);
                    
                    if (!session) {
                        finalText.push(`[Error: Server ${serverName} not found]`);
                        continue;
                    }
                    
                    const toolArgs = JSON.parse(toolCall.function.arguments);
                    let result: any;
                    
                    if (functionType === 'listResources') {
                        // 处理资源列表请求
                        finalText.push(`[Listing resources on server ${serverName}]`);
                        const resources = await this.listResources(serverName);
                        const resourceList = resources.map(r => `- ${r.name}: ${r.description || 'No description'}`).join('\n');
                        result = {
                            content: `Available resources on ${serverName}:\n${resourceList}`
                        };
                    } else if (functionType === 'readResource') {
                        // 处理资源读取请求
                        const resourceName = functionNameParts[2];
                        finalText.push(`[Reading resource ${resourceName} on server ${serverName} with params ${JSON.stringify(toolArgs)}]`);
                        try {
                            const resourceResult = await this.readResource(serverName, resourceName, toolArgs);
                            
                            // 处理不同类型的资源内容
                            let contentText = '';
                            for (const content of resourceResult.contents) {
                                if (content.mimeType.startsWith('image/')) {
                                    contentText += `[Image: ${content.uri} (${content.mimeType})]`;
                                    // 如果需要，可以在这里添加图像处理逻辑
                                } else if (content.text) {
                                    contentText += content.text;
                                } else if (content.blob) {
                                    contentText += `[Binary data: ${content.uri} (${content.mimeType})]`;
                                }
                            }
                            
                            result = {
                                content: contentText || 'Resource content is empty'
                            };
                        } catch (error) {
                            result = {
                                content: `Error reading resource: ${(error as Error).message}`
                            };
                        }
                    } else {
                        // 处理普通工具调用
                        finalText.push(`[Calling tool ${functionType} on server ${serverName} with args ${JSON.stringify(toolArgs)}]`);
                        result = await session.callTool({
                            name: functionType,
                            arguments: toolArgs
                        });
                    }
                    
                    const toolResult = result as unknown as MCPToolResult;
                    // Log the content appropriately based on its type
                    if (typeof toolResult.content === 'string') {
                        console.log(toolResult.content);
                    } else if (Array.isArray(toolResult.content)) {
                        console.log(JSON.stringify(toolResult.content));
                    }
                    
                    // Add the content to finalText based on its type
                    if (typeof toolResult.content === 'string') {
                        finalText.push(toolResult.content);
                    } else if (Array.isArray(toolResult.content)) {
                        const contentDescription = toolResult.content.map((item: {
                            type: string;
                            text?: string;
                            data?: string;
                            mimeType?: string;
                        }) => {
                            if (item.type === 'text') {
                                return item.text || '';
                            } else if (item.type === 'image') {
                                return `[Image received: Health data visualization that cannot be displayed directly. The image shows health metrics for the requested device and date.]`;
                            } else {
                                return `[Content of type ${item.type}]`;
                            }
                        }).join('\n');
                        finalText.push(contentDescription);
                    }
                    
                    // Continue with the conversation
                    messages.push({
                        role: "assistant",
                        content: "",
                        tool_calls: [toolCall]
                    });
                    
                    // Create a text-only version of the content for the API
                    let toolResultContent = '';
                    if (typeof toolResult.content === 'string') {
                        toolResultContent = toolResult.content;
                    } else if (Array.isArray(toolResult.content)) {
                        toolResultContent = toolResult.content.map((item: {
                            type: string;
                            text?: string;
                            data?: string;
                            mimeType?: string;
                        }) => {
                            if (item.type === 'text') {
                                return item.text || '';
                            } else if (item.type === 'image') {
                                return `[Image received: This is a health data visualization that cannot be displayed directly in text. The image shows health metrics visualization for the requested device and date.]`;
                            } else {
                                return `[Content of type ${item.type}]`;
                            }
                        }).join('\n');
                    }
                    
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResultContent
                    });
                    
                    // Get the next response
                    const nextCompletion = await this.openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages,
                        tools: availableTools,
                        tool_choice: "auto"
                    });
                    
                    if (nextCompletion.choices[0].message.content) {
                        finalText.push(nextCompletion.choices[0].message.content);
                    }
                }
            }
        }
        
        return finalText.join("\n");
    }
    
    async chatLoop(): Promise<void> {
        console.log("\nMCP Client Started!");
        console.log("Type your queries or 'quit' to exit.");
        const readline = createInterface({
            input: process.stdin,
            output: process.stdout
        });
        const askQuestion = () => {
            return new Promise<string>((resolve) => {
                readline.question("\nQuery: ", resolve);
            });
        };
        try {
            while (true) {
                const query = (await askQuestion()).trim();
                if (query.toLowerCase() === 'quit') {
                    break;
                }
                try {
                    const response = await this.processQuery(query);
                    console.log("\n" + response);
                } catch (error) {
                    console.error("\nError:", error);
                }
            }
        } finally {
            readline.close();
        }
    }
    
    async cleanup(): Promise<void> {
        for (const transport of this.transports.values()) {
            await transport.close();
        }
        this.transports.clear();
        this.sessions.clear();
    }
    
    hasActiveSessions(): boolean {
        return this.sessions.size > 0;
    }
}

// 主函数
async function main() {
    const openServers = MCPClient.getOpenServers();
    console.log("Connecting to servers:", openServers.join(", "));
    const client = new MCPClient();
    
    try {
        // 连接所有开启的服务器
        for (const serverName of openServers) {
            try {
                await client.connectToServer(serverName);
            } catch (error) {
                console.error(`Failed to connect to server '${serverName}':`, error);
            }
        }
        if (!client.hasActiveSessions()) {
            throw new Error("Failed to connect to any server");
        }
        await client.chatLoop();
    } finally {
        await client.cleanup();
    }
}

// 运行主函数
main().catch(console.error);﻿