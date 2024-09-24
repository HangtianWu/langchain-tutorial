const {
  DefaultAzureCredential,
  getBearerTokenProvider,
} = require('@azure/identity');
const { AzureChatOpenAI, OpenAIEmbeddings } = require('@langchain/openai');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { RunnableSequence } = require('@langchain/core/runnables');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');

const { GithubRepoLoader } = require('langchain/document_loaders/web/github');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

const convertDocsToString = (documents) => {
  return documents.map((document) => {
    return `<doc>\n${document.pageContent}\n</doc>`
  }).join("\n");
};

async function main() {
  const loader = new GithubRepoLoader(
    "https://github.com/langchain-ai/langchainjs",
    { recursive: false, ignorePaths: ["*.md", "yarn.lock", "package.json", "package-lock.json"] }
  );

  const docs = await loader.load();
  const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
    chunkSize: 32,
    chunkOverlap: 0,
  });
    
  const splitDocs = await splitter.splitText(docs);

  const embeddings = new OpenAIEmbeddings();
  const vectorstore = new MemoryVectorStore(embeddings);
  await vectorstore.addDocuments(splitDocs);

  const retriever = vectorstore.asRetriever();


  const documentRetrievalChain = RunnableSequence.from([
      (input) => input.question,
      retriever,
      convertDocsToString
  ]);


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

  const TEMPLATE_STRING = `You are an experienced researcher, 
  expert at interpreting and answering questions based on provided sources.
  Using the provided context, answer the user's question 
  to the best of your ability using only the resources provided. 
  Be verbose!

  <context>

  {context}

  </context>

  Now, answer this question using the above context:

  {question}`;

  const promptWithContext = ChatPromptTemplate.fromTemplate(
    TEMPLATE_STRING
  );

  const outputParser = new StringOutputParser();

  const retrievalChain = RunnableSequence.from([
    {
      context: documentRetrievalChain,
      question: (input) => input.question,
    },
    promptWithContext,
    model,
    outputParser,
  ]);

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