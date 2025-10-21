import { Response } from "express";
import { z } from "zod";
import OpenAI from "openai";
import { assistantResValidation } from "../utils/validation";
import ResponseHandler from "../utils/apiResponse";
import dotenv from "dotenv";
dotenv.config();

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY!,
// });

class AssistantService {
  // async getGPTResponse(
  //   promptData: z.infer<typeof assistantResValidation>,
  //   res: Response
  // ) {
  //   try {
  //     const { prompt } = promptData;
  //     const response = await openai.chat.completions.create({
  //       // model: "gpt-3.5-turbo",
  //       model: "gpt-4-0613",
  //       messages: [{ role: "user", content: prompt }],
  //       max_tokens: 150,
  //       temperature: 0.5,
  //     });
  //     const reply = response.choices[0]?.message?.content;
  //     return ResponseHandler.success(res, "AI response generated", { reply });
  //   } catch (error: any) {
  //     return ResponseHandler.internalError(
  //       res,
  //       "Failed to generate AI response",
  //       error
  //     );
  //   }
  // }
}

export default new AssistantService();
