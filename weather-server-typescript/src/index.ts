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
  { userId: z.string(), date: z.string().optional() },
  async ({ userId, date = '20250401' }) => {
    try {
      console.log(`Fetching health data for device ${userId} on date ${date}`);
      // Using the specific health metrics API endpoint
      const response = await axios.get(`http://43.138.239.43:8000/get_daily_data_by_device/${userId}/${date}`);
      const data = response.data;
      
      console.log("API Response received");
      
      let summaryText = `Health Metrics for Device ${userId} on ${date}:\n`;
      
      // Check if data has the time-series format
      if (data && data.data) {
        // Extract the last entry (most recent) to show current stats
        const timeKeys = Object.keys(data.data);
        if (timeKeys.length > 0) {
          const lastTimeKey = timeKeys[timeKeys.length - 1];
          const lastReading = data.data[lastTimeKey];
          
          // Add metrics to summary
          summaryText += `Last reading time: ${lastTimeKey}\n`;
          summaryText += `Heart Rate: ${lastReading.HR || 'N/A'} bpm\n`;
          summaryText += `Motion: ${lastReading.motion || 'N/A'}\n`;
          
          if (lastReading.gcyy) {
            summaryText += `GCYY: ${lastReading.gcyy || 'N/A'}\n`;
          }
          
          if (lastReading.area_up) {
            summaryText += `Area Up: ${lastReading.area_up || 'N/A'}\n`;
          }
          
          if (lastReading.area_down) {
            summaryText += `Area Down: ${lastReading.area_down || 'N/A'}\n`;
          }
        } else {
          summaryText += "No time-series data available for this device/date.";
        }
      } else {
        summaryText += "Data format not recognized.";
      }
      
      return {
        content: [{ 
          type: "text", 
          text: summaryText
        }]
      }
    } catch (error: any) {
      console.error("Error fetching health metrics:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
      }
      return {
        content: [{ 
          type: "text", 
          text: `Unable to retrieve health metrics for device ${userId}. Error: ${error.message}`
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