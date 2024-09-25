const fs = require('fs');
const { z } = require('zod');
const {
  DefaultAzureCredential,
  getBearerTokenProvider,
} = require('@azure/identity');
const { AzureChatOpenAI } = require('@langchain/openai');
const { HumanMessage } = require('@langchain/core/messages');
const { WikipediaQueryRun } = require('@langchain/community/tools/wikipedia_query_run');
const { MemorySaver } = require('@langchain/langgraph');
const { createReactAgent } = require('@langchain/langgraph/prebuilt');
const { tool } = require('@langchain/core/tools');

async function main() {
  const credentials = new DefaultAzureCredential();
  const azureADTokenProvider = getBearerTokenProvider(
    credentials,
    "https://cognitiveservices.azure.com/.default"
  );

  const llm = new AzureChatOpenAI({
    azureADTokenProvider,
    azureOpenAIApiInstanceName: "stca-ads-oai-gpt4",
    azureOpenAIApiDeploymentName: "gpt-4",
    azureOpenAIApiVersion: "2024-08-01-preview",
    temperature: 0,
    // verbose: true,
  });

  const calculatorSchema = z.object({
    operation: z
      .enum(["add", "subtract", "multiply", "divide"])
      .describe("The type of operation to execute."),
    number1: z.number().describe("The first number to operate on."),
    number2: z.number().describe("The second number to operate on."),
  });
  
  const calculatorTool = tool(
    async ({ operation, number1, number2 }) => {
      // Functions must return strings
      if (operation === "add") {
        return `${number1 + number2}`;
      } else if (operation === "subtract") {
        return `${number1 - number2}`;
      } else if (operation === "multiply") {
        return `${number1 * number2}`;
      } else if (operation === "divide") {
        return `${number1 / number2}`;
      } else {
        throw new Error("Invalid operation.");
      }
    },
    {
      name: "calculator",
      description: "Can perform mathematical operations.",
      schema: calculatorSchema,
    }
  );

  const wikiTool = new WikipediaQueryRun({
    topKResults: 3,
    maxDocContentLength: 4000,
  });

  const tools = [wikiTool, calculatorTool];

  // Initialize memory to persist state between graph runs
  const agentCheckpointer = new MemorySaver();
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: agentCheckpointer,
  });

  const graph = agent.getGraph();
  const image = await graph.drawMermaidPng();
  const arrayBuffer = await image.arrayBuffer();
  // save graph to local
  fs.writeFileSync('graph.png', new Uint8Array(arrayBuffer));

  const agentState = await agent.invoke(
    { messages: [new HumanMessage('Introduce me the story of book <Pride and Prejudice> and introduce me the author of the book.')] },
    { configurable: { thread_id: "42" } },
  );

  console.log('-----------First Answer:-----------');
  console.log(
    agentState.messages[agentState.messages.length - 1].content,
  );

  const agentNextState = await agent.invoke(
    { messages: [new HumanMessage('In which year was the author born? Please calculate how many years have passed since this year. It is 2024 this year')] },
    { configurable: { thread_id: "42" } },
  );

  console.log('-----------Next Answer:-----------');
  console.log(
    agentNextState.messages[agentNextState.messages.length - 1].content,
  );
}

main();