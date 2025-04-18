import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import OpenAI from "openai";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
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
    content: string;
}
interface ServerConfig {
    name: string;
    type: 'command' | 'sse';
    command?: string;
    url?: string;
    isOpen?: boolean;
}
class MCPClient {
    static getOpenServers(): string[] {
        return config.filter(cfg => cfg.isOpen).map(cfg => cfg.name);
    }
    private sessions: Map<string, Client> = new Map();
    private transports: Map<string, StdioClientTransport | SSEClientTransport> = new Map();
    private openai: OpenAI;
    constructor() {
        this.openai = new OpenAI({
            apiKey: OPENAI_API_KEY
        });
    }
    async listResources(serverName: string): Promise<any> {
        const session = this.sessions.get(serverName);
        if (!session) {
          throw new Error(`Server ${serverName} not found`);
        }
        return await session.listResources();
      }
      
    async getResource(serverName: string, resourceName: string, params: any): Promise<any> {
        const session = this.sessions.get(serverName);
        if (!session) {
        throw new Error(`Server ${serverName} not found`);
        }
        return await session.getResource({
        name: resourceName,
        arguments: params
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
        const response = await client.listTools();
        console.log(`\nConnected to server '${serverName}' with tools:`, response.tools.map((tool: Tool) => tool.name));
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
        // Example query handling for health images
        if (query.toLowerCase().includes('health') && query.toLowerCase().includes('image')) {
            // Extract deviceId and date (with simple parsing logic)
            const deviceIdMatch = query.match(/device\s+([A-Za-z0-9]+)/);
            const dateMatch = query.match(/date\s+([0-9\-]+)/);
            
            const deviceId = deviceIdMatch ? deviceIdMatch[1] : "default_device";
            const date = dateMatch ? dateMatch[1] : "20250418";
            
            try {
            // Assuming 'health-server' is one of your connected servers
            const imageResource = await this.getResource('health-server', 'healthImage', { 
                deviceId, 
                date 
            });
            
            // Handle the image data (could save to file or display in UI)
            console.log(`Retrieved health image for device ${deviceId}`);
            // Save image or display it depending on your client's capabilities
            
            return `Successfully retrieved health visualization for device ${deviceId} on ${date}`;
            } catch (error) {
            return `Error retrieving health image: ${error.message}`;
            }
        }
        // 获取所有服务器的工具列表
        const availableTools: any[] = [];
        for (const [serverName, session] of this.sessions) {
            const response = await session.listTools();
            const tools = response.tools.map((tool: Tool) => ({
                type: "function" as const,
                function: {
                    name: `${serverName}__${tool.name}`,
                    description: `[${serverName}] ${tool.description}`,
                    parameters: tool.inputSchema
                }
            }));
            availableTools.push(...tools);
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
                    const [serverName, toolName] = toolCall.function.name.split('__');
                    const session = this.sessions.get(serverName);
                    
                    if (!session) {
                        finalText.push(`[Error: Server ${serverName} not found]`);
                        continue;
                    }
                    const toolArgs = JSON.parse(toolCall.function.arguments);
                    // 执行工具调用
                    const result = await session.callTool({
                        name: toolName,
                        arguments: toolArgs
                    });
                    const toolResult = result as unknown as MCPToolResult;
                    finalText.push(`[Calling tool ${toolName} on server ${serverName} with args ${JSON.stringify(toolArgs)}]`);
                    console.log(toolResult.content);
                    finalText.push(toolResult.content);
                    // 继续与工具结果的对话
                    messages.push({
                        role: "assistant",
                        content: "",
                        tool_calls: [toolCall]
                    });
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: toolResult.content
                    });
                    // 获取下一个响应
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