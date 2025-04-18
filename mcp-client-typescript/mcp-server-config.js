
const config = [
    // {
    //   name: 'demo-stdio',
    //   type: 'command',
    //   command: 'node ~/code-open/cursor-toolkits/mcp/build/demo-stdio.js',
    //   isOpen: true
    // },
    // {
    //   name: 'health-metrics-stdio',
    //   type: 'command',
    //   command: 'node ~/code-open/cursor-toolkits/mcp/build/health-metrics-stdio.js',
    //   isOpen: true
    // },
    {
      name: 'demo-sse',
      type: 'sse',
      url: 'http://localhost:3001/sse',
      isOpen: true
    }
  ];
  export default config;