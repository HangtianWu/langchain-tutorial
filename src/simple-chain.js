const {
  DefaultAzureCredential,
  getBearerTokenProvider,
} = require('@azure/identity');
const { AzureChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');


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

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are a helpful assistant that translates {input_language} to {output_language}.",
    ],
    ["human", "{input}"],
  ]);

  const outputParser = new StringOutputParser();

  const simpleChain = prompt.pipe(llm).pipe(outputParser);

  // const output = await simpleChain.invoke({
  //   input_language: "English",
  //   output_language: "German",
  //   input: "I love programming.",
  // });

  // const stream = await simpleChain.stream({
  //   input_language: "English",
  //   output_language: "German",
  //   input: "I love programming.",
  // });
  
  // for await (const chunk of stream) {
  //     console.log(chunk);
  // }

  const inputs = [
    {
      input_language: "English",
      output_language: "German",
      input: "I love programming.",
    },
    {
      input_language: "English",
      output_language: "French",
      input: "Hello.",
    },
  ];
  const outputs = await simpleChain.batch(inputs);

  console.log(outputs);
}

main();