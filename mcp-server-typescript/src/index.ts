import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import axios from 'axios';
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const server = new McpServer({
  name: "demo-sse",
  version: "1.0.0"
});

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Citta documentation for interpretations
const cittaDoc = fs.readFileSync(path.join(__dirname, '../citta.txt'), 'utf-8');

server.tool("healthMetrics",
  'Get user health metrics from external API',
  { userId: z.string(), date: z.string().optional() },
  async ({ userId, date = '20250401' }) => {
    try {
      // Standardize date format to YYYYMMDD for API
      let formattedDate = date;
      
      // Handle date formats like "2023-04-01"
      if (typeof date === 'string' && date.includes('-')) {
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

server.tool("interpretHealthMetrics",
  'Interpret health metrics based on Citta documentation',
  { 
    heartRate: z.number(), 
    citta: z.number(), 
    motion: z.number() 
  },
  async ({ heartRate, citta, motion }) => {
    try {
      // Determine state based on Citta documentation
      let state = "";
      let description = "";
      
      // Motion threshold
      const isHighMotion = motion > 5;
      
      // Heart rate and Citta thresholds (these are assumptions; adjust as needed)
      const isHighHeartRate = heartRate > 80;
      const isHighCitta = citta > 50;
      
      // State determination based on Citta documentation
      if (isHighCitta && !isHighHeartRate && !isHighMotion) {
        state = "1";
        description = "脑力快乐，喜悦、心流状态";
      } else if (isHighCitta && isHighHeartRate && isHighMotion) {
        state = "2";
        description = "活动快乐";
      } else if (!isHighCitta && !isHighHeartRate && !isHighMotion) {
        state = "3";
        description = "睡眠或者疾病状态";
      } else if (!isHighCitta && !isHighHeartRate && isHighMotion) {
        state = "4";
        description = "焦虑、治疗干预中";
      } else if (!isHighCitta && isHighHeartRate && isHighMotion) {
        state = "5";
        description = "运动锻炼状态";
      } else if (isHighCitta && !isHighHeartRate && isHighMotion) {
        state = "6";
        description = "体动快乐，优秀运动员状态";
      } else if (!isHighCitta && isHighHeartRate && !isHighMotion) {
        state = "7";
        description = "焦虑、过度压力、或健康干预过程中";
      } else if (isHighCitta && isHighHeartRate && !isHighMotion) {
        state = "8";
        description = "激动开心状态";
      }
      
      // Additional context about Citta
      const cittaExplanation = "心绪（Citta）基于心率变异性（HRV）参数，定量描述身心状态和情绪质量。心绪值越高，表示身心状态越健康，通常与愉悦、幸福和快乐相关。";
      const motionExplanation = motion > 5 ? "体动>5：大部分是清醒状态" : "体动0-5：睡眠或者静息";
      
      return {
        content: [{ 
          type: "text", 
          text: `健康状态解读：\n\n` +
                `当前状态: 状态${state} - ${description}\n\n` +
                `指标详情:\n` +
                `- 心率: ${heartRate} bpm\n` +
                `- 心绪值: ${citta}\n` +
                `- 体动值: ${motion} (${motionExplanation})\n\n` +
                `${cittaExplanation}\n\n` +
                `注意：睡眠与静息心绪与清醒心绪不具有可比性。`
        }]
      };
    } catch (error) {
      console.error("Error interpreting health metrics:", error);
      return {
        content: [{ 
          type: "text", 
          text: `无法解读健康指标。请检查输入值是否有效。`
        }]
      };
    }
  }
);

server.tool("getHealthImageData",
  'Download health data visualization as PNG',
  { deviceId: z.string(), date: z.string().optional() },
  async ({ deviceId, date = '20250418' }) => {
    try {
      // Standardize date format to YYYYMMDD for API
      let formattedDate = date;
      
      // Handle date formats like "2023-04-01"
      if (typeof date === 'string' && date.includes('-')) {
        formattedDate = date.replace(/-/g, '');
      }
      
      // Format date for display (YYYY-MM-DD)
      const displayDate = formattedDate.length === 8 
        ? `${formattedDate.substring(0, 4)}-${formattedDate.substring(4, 6)}-${formattedDate.substring(6, 8)}`
        : formattedDate;
      
      // Set timeout to prevent long-running requests
      const response = await axios.get(
        `http://43.138.239.43:8000/get_png_file_by_device/${deviceId}/${formattedDate}`,
        { 
          timeout: 10000, // 10 second timeout
          responseType: 'arraybuffer' // Important for binary data
        }
      );
      
      // Check if we got a valid image response
      if (response.headers['content-type'] === 'image/png') {
        // Convert image data to base64
        const base64Image = Buffer.from(response.data, 'binary').toString('base64');
        
        return {
          content: [{ 
            type: "image", 
            data: base64Image,
              mimeType: "image/png"
          }]
        };
      } else {
        return {
          content: [{ 
            type: "text", 
            text: `Unable to retrieve health visualization for device ${deviceId} on ${displayDate}. The server did not return a valid image.`
          }]
        };
      }
    } catch (error) {
      console.error("Error fetching health image:", error);
      const errorMessage = (error as any).code === 'ECONNABORTED' 
        ? `Request timed out. The health data server is not responding.` 
        : `Unable to retrieve health visualization for device ${deviceId}. Please try again later.`;
      
      return {
        content: [{ 
          type: "text", 
          text: errorMessage
        }]
      };
    }
  },
);

server.resource(
  "healthImage",
  new ResourceTemplate("health://image/{deviceId}/{date?}", { list: undefined }),
  {
    parameters: {
      deviceId: {
        type: "string",
        description: "Unique identifier for the health monitoring device"
      },
      date: {
        type: "string", 
        description: "Date for health data in YYYYMMDD format or YYYY-MM-DD format",
        required: false
      }
    }
  },
  async (uri, params) => {
    const { deviceId, date = "20250418" } = params;
    try {
      // Standardize date format to YYYYMMDD for API
      let formattedDate = date;
      
      // Handle date formats like "2023-04-01"
      if (typeof date === 'string' && date.includes('-')) {
        formattedDate = date.replace(/-/g, '');
      }
      
      // Set timeout to prevent long-running requests
      const response = await axios.get(
        `http://43.138.239.43:8000/get_png_file_by_device/${deviceId}/${formattedDate}`,
        { 
          timeout: 10000, // 10 second timeout
          responseType: 'arraybuffer' // Important for binary data
        }
      );
      
      // Check if we got a valid image response
      if (response.headers['content-type'] === 'image/png') {
        // Return the image as a binary resource
        return {
          contents: [{
            uri: uri.href,
            mimeType: "image/png",
            blob: Buffer.from(response.data).toString('base64')
          }]
        };
      } else {
        throw new Error(`Server did not return a valid image for device ${deviceId} on ${formattedDate}`);
      }
    } catch (error: unknown) {
      console.error("Error fetching health image:", error);
      const errorMessage = ((error as any).code === 'ECONNABORTED') 
        ? `Request timed out. The health data server is not responding.` 
        : `Unable to retrieve health visualization for device ${deviceId}. Please try again later.`;
      
      throw new Error(errorMessage);
    }
  }
);

// Add simple citta documentation resource
server.resource(
  "cittaDoc",
  "health://citta-documentation",
  {},
  async (uri) => {
    try {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          blob: Buffer.from(cittaDoc).toString('base64')
        }]
      };
    } catch (error: unknown) {
      console.error("Error providing citta documentation:", error);
      throw new Error("Unable to provide citta documentation.");
    }
  }
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