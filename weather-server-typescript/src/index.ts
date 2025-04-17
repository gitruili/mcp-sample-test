import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import axios from 'axios';

const server = new McpServer({
  name: "demo-sse",
  version: "1.0.0"
});

server.tool("exchange",
  '人民币汇率换算',
  { rmb: z.number() },
  async ({ rmb }) => {
    // 使用固定汇率进行演示，实际应该调用汇率API
    const usdRate = 0.14; // 1人民币约等于0.14美元
    const hkdRate = 1.09; // 1人民币约等于1.09港币
    
    const usd = (rmb * usdRate).toFixed(2);
    const hkd = (rmb * hkdRate).toFixed(2);
    
    return {
      content: [{ 
        type: "text", 
        text: `${rmb}人民币等于:\n${usd}美元\n${hkd}港币`
      }]
    }
  },
);

server.tool("healthMetrics",
  'Get user health metrics from external API',
  { userId: z.string() },
  async ({ userId }) => {
    try {
      // Replace with your actual health metrics API endpoint
      const response = await axios.get(`http://43.138.239.43:8000/get_daily_data_by_device/9F2BC220625C29D/20250401`);
      const healthData = response.data;
      
      return {
        content: [{ 
          type: "text", 
          text: `Health Metrics for User ${userId}:\n` +
                `Steps: ${healthData.steps}\n` +
                `Heart Rate: ${healthData.heartRate} bpm\n` +
                `Sleep: ${healthData.sleep} hours\n` +
                `Calories: ${healthData.calories} kcal`
        }]
      }
    } catch (error) {
      console.error("Error fetching health metrics:", error);
      return {
        content: [{ 
          type: "text", 
          text: `Unable to retrieve health metrics for user ${userId}. Please try again later.`
        }]
      }
    }
  },
);

const app = express();
const sessions: Record<string, { transport: SSEServerTransport; response: express.Response }> = {}
app.get("/sse", async (req: express.Request, res: express.Response) => {
  console.log(`New SSE connection from ${req.ip}`);
  const sseTransport = new SSEServerTransport("/messages", res);
  const sessionId = sseTransport.sessionId;
  if (sessionId) {
    sessions[sessionId] = { transport: sseTransport, response: res }
  }
  await server.connect(sseTransport);
});

app.post("/messages", async (req: express.Request, res: express.Response) => {
  const sessionId = req.query.sessionId as string;
  const session = sessions[sessionId];
  if (!session) {
    res.status(404).send("Session not found");
    return;
  }

  await session.transport.handlePostMessage(req, res);
});

app.listen(3001);