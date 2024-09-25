const {
  DefaultAzureCredential,
  getBearerTokenProvider,
} = require('@azure/identity');
const { AzureChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { WikipediaQueryRun } = require('@langchain/community/tools/wikipedia_query_run');
const { createToolCallingAgent, AgentExecutor  } = require('langchain/agents');
const { tool } = require('@langchain/core/tools');
const { z } = require('zod');

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
    verbose: true,
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

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "You are a helpful assistant"],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"],
  ]);

  const agent = await createToolCallingAgent({ llm, tools, prompt });

  const agentExecutor = new AgentExecutor({
    agent,
    tools,
  });

  // const result1 = await agentExecutor.invoke({ input: "What is 78 * 98?" });
  // console.log('-----------Result 1:-----------');
  // console.log(result1);

  const result2 = await agentExecutor.invoke({ input: "What is deep learning? Also introduce me the authors of Book <Deep Learning>" });
  console.log('-----------Result 2:-----------');
  console.log(result2);
}

main();