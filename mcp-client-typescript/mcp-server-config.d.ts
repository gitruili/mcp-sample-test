interface ServerConfig {
  name: string;
  type: 'command' | 'sse';
  command?: string;
  url?: string;
  isOpen?: boolean;
}

declare const config: ServerConfig[];
export default config; 