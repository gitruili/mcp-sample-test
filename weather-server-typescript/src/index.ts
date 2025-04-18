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
      // Standardize date format to YYYYMMDD for API
      let formattedDate = date;
      
      // Handle date formats like "2023-04-01"
      if (date.includes('-')) {
        formattedDate = date.replace(/-/g, '');
      }
      
      // Format date for display (YYYY-MM-DD)
      const displayDate = formattedDate.length === 8 
        ? `${formattedDate.substring(0, 4)}-${formattedDate.substring(4, 6)}-${formattedDate.substring(6, 8)}`
        : formattedDate;
      
      // Set timeout to prevent long-running requests
      const response = await axios.get(
        `http://43.138.239.43:8000/get_daily_data_by_device/${userId}/${formattedDate}`,
        { timeout: 5000 } // 5 second timeout
      );
      const healthData = response.data;
      
      // Check if data exists and has the expected structure
      if (!healthData || !healthData.data || Object.keys(healthData.data).length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No health metrics found for user ${userId} on ${displayDate}.`
          }]
        }
      }
      
      // Calculate daily averages instead of showing all timestamps
      const allMetrics = Object.values(healthData.data) as any[];
      
      if (allMetrics.length === 0) {
        return {
          content: [{ 
            type: "text", 
            text: `No health metrics found for user ${userId} on ${displayDate}.`
          }]
        }
      }
      
      // Calculate averages
      const avgHeartRate = allMetrics.reduce((sum, m) => sum + m.HR, 0) / allMetrics.length;
      const avgMotion = allMetrics.reduce((sum, m) => sum + m.motion, 0) / allMetrics.length;
      const avgAreaUp = allMetrics.reduce((sum, m) => sum + m.area_up, 0) / allMetrics.length;
      const avgAreaDown = allMetrics.reduce((sum, m) => sum + m.area_down, 0) / allMetrics.length;
      const avgPressure = allMetrics.reduce((sum, m) => sum + m.gcyy, 0) / allMetrics.length;
      
      // Get min and max heart rates
      const minHeartRate = Math.min(...allMetrics.map(m => m.HR));
      const maxHeartRate = Math.max(...allMetrics.map(m => m.HR));
      
      // Limit to first 5 timestamps for sample data
      const sampleEntries = Object.entries(healthData.data).slice(0, 5);
      
      return {
        content: [{ 
          type: "text", 
          text: `Health Summary for User ${userId} on ${displayDate}:\n\n` +
                `Daily Averages:\n` +
                `- Average Heart Rate: ${avgHeartRate.toFixed(1)} bpm (Min: ${minHeartRate.toFixed(1)}, Max: ${maxHeartRate.toFixed(1)})\n` +
                `- Average Motion: ${avgMotion.toFixed(2)}\n` +
                `- Average Chest Movement Up: ${avgAreaUp.toFixed(2)}\n` +
                `- Average Chest Movement Down: ${avgAreaDown.toFixed(2)}\n` +
                `- Average Pressure Index: ${avgPressure.toFixed(2)}\n\n` +
                `Total Measurements: ${allMetrics.length}\n\n` +
                `Sample Data (First 5 Measurements):\n` +
                sampleEntries.map(([timestamp, metrics]: [string, any]) => {
                  return `Time: ${timestamp}\n` +
                         `Heart Rate: ${metrics.HR.toFixed(1)} bpm\n` +
                         `Motion: ${metrics.motion.toFixed(2)}\n`;
                }).join('\n')
        }]
      }
    } catch (error) {
      console.error("Error fetching health metrics:", error);
      const errorMessage = (error as any).code === 'ECONNABORTED' 
        ? `Request timed out. The health data server is not responding.` 
        : `Unable to retrieve health metrics for user ${userId}. Please try again later.`;
      
      return {
        content: [{ 
          type: "text", 
          text: errorMessage
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