const {
  DefaultAzureCredential,
  getBearerTokenProvider,
} = require('@azure/identity');
const { AzureChatOpenAI, AzureOpenAIEmbeddings } = require('@langchain/openai');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { StringOutputParser } = require('@langchain/core/output_parsers');
const { GithubRepoLoader } = require('@langchain/community/document_loaders/web/github');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { RunnableSequence, RunnablePassthrough, RunnableWithMessageHistory, RunnableMap } = require('@langchain/core/runnables');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { ChatMessageHistory } = require('langchain/stores/message/in_memory');

const convertDocsToString = (documents) => {
  return documents.map((document) => {
    return `<code>\n${document.pageContent}\n</code>`
  }).join("\n");
};

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

  const loader = new GithubRepoLoader(
    "https://github.com/HangtianWu/langchain-tutorial",
    {
      branch: "master",
      recursive: true,
      ignorePaths: ["*.md", "yarn.lock", "package.json", "package-lock.json"]
    }
  );

  const docs = await loader.load();
  const splitter = RecursiveCharacterTextSplitter.fromLanguage("js", {
    chunkSize: 250,
    chunkOverlap: 50,
  });
    
  const splitDocs = await splitter.splitDocuments(docs);

  const embeddings = new AzureOpenAIEmbeddings({
    azureADTokenProvider,
    azureOpenAIApiEmbeddingsDeploymentName: 'text-embedding-3-large',
    azureOpenAIApiInstanceName: 'stca-ads-oai',
    azureOpenAIApiVersion: '2024-02-01'
  });
  const vectorstore = new MemoryVectorStore(embeddings);
  await vectorstore.addDocuments(splitDocs);

  const retriever = vectorstore.asRetriever();


  const documentRetrievalChain = RunnableSequence.from([
      (input) => input.question,
      retriever,
      convertDocsToString
  ]);

  // const runnableMap = RunnableMap.from({
  //   context: documentRetrievalChain,
  //   question: (input) => input.question,
  // });
  
  // const result = await runnableMap.invoke({
  //     question: "What is getDefaultItemAriaLabel?"
  // });

  // console.log(result);

  const TEMPLATE_STRING = `You are an experienced JS developer, expert at interpreting and answering questions based on provided sources.
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
    llm,
    outputParser,
  ]);

  // const answer = await retrievalChain.invoke({
  //   question: "Can you find bugs for function getDefaultItemIcon?"
  // });
  
  // console.log('-----------Answer:-----------');
  // console.log(answer);
  // return;

  // Add chat history
  const REPHRASE_QUESTION_SYSTEM_TEMPLATE = 
  `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.`;

  const rephraseQuestionChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", REPHRASE_QUESTION_SYSTEM_TEMPLATE],
    new MessagesPlaceholder("history"),
    [
      "human", 
      "Rephrase the following question as a standalone question:\n{question}"
    ],
  ]);

  const rephraseQuestionChain = RunnableSequence.from([
    rephraseQuestionChainPrompt,
    llm,
    outputParser,
  ]);

  const messageHistory = new ChatMessageHistory();

  const answerGenerationChainPrompt = ChatPromptTemplate.fromMessages([
    ["system", TEMPLATE_STRING],
    new MessagesPlaceholder("history"),
    [
      "human", 
      "Now, answer this question using the previous context and chat history:\n{standalone_question}"
    ]
  ]);

  const conversationalRetrievalChain = RunnableSequence.from([
    RunnablePassthrough.assign({
      standalone_question: rephraseQuestionChain,
    }),
    RunnablePassthrough.assign({
      context: documentRetrievalChain,
    }),
    answerGenerationChainPrompt,
    llm,
    outputParser,
  ]);

  const finalRetrievalChain = new RunnableWithMessageHistory({
    runnable: conversationalRetrievalChain,
    getMessageHistory: (_sessionId) => messageHistory,
    historyMessagesKey: "history",
    inputMessagesKey: "question",
  });

  const originalQuestion = "Can you find bugs for function getDefaultItemIcon?";

  const originalAnswer = await finalRetrievalChain.invoke({
    question: originalQuestion,
  }, {
    configurable: { sessionId: "test" }
  });

  console.log('-----------Original Answer:-----------');
  console.log(originalAnswer);
  
  const finalResult = await finalRetrievalChain.invoke({
    question: "Can you generate unit test for it to cover the bug?",
  }, {
    configurable: { sessionId: "test" }
  });
  console.log('-----------Final Answer:-----------');
  console.log(finalResult);
}

main();