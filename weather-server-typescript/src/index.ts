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
  'Get user health metrics from external API by device ID and date',
  { deviceId: z.string().optional(), date: z.string().optional() },
  async ({ deviceId = '9F2BC220625C29D', date = '20250401' }) => {
    try {
      // Replace with your actual health metrics API endpoint
      const response = await axios.get(`http://43.138.239.43:8000/get_daily_data_by_device/${deviceId}/${date}`);
      const healthData = response.data;
      
      // Check if data exists and has the expected structure
      if (!healthData || !healthData.data || Object.keys(healthData.data).length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No health metrics found for device ${deviceId} on ${date}.`
          }]
        }
      }
      
      return {
        content: [{ 
          type: "text", 
          text: `Health Metrics for Device ${deviceId} on ${date}:\n\n` +
                Object.entries(healthData.data).map(([timestamp, metrics]: [string, any]) => {
                  return `Time: ${timestamp}\n` +
                         `Heart Rate: ${metrics.HR.toFixed(1)} bpm\n` +
                         `Motion: ${metrics.motion.toFixed(2)}\n` +
                         `Chest Movement Up: ${metrics.area_up.toFixed(2)}\n` +
                         `Chest Movement Down: ${metrics.area_down.toFixed(2)}\n` +
                         `Pressure Index: ${metrics.gcyy.toFixed(2)}\n`;
                }).join('\n')
        }]
      }
    } catch (error) {
      console.error("Error fetching health metrics:", error);
      return {
        content: [{ 
          type: "text", 
          text: `Unable to retrieve health metrics for device ${deviceId}. Please try again later.`
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