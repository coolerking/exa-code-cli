/**
 * AI prompt templates for web content analysis and processing
 * Used by WebFetch and WebSearch tools for processing fetched content
 */

export interface PromptTemplate {
  name: string;
  description: string;
  template: string;
  variables: string[];
}

/**
 * Web content analysis prompt templates
 */
export const WEB_CONTENT_ANALYSIS_PROMPTS: { [key: string]: PromptTemplate } = {
  summarize: {
    name: 'Content Summarization',
    description: 'Create a concise summary of web content',
    template: `Please analyze the following web content and create a concise summary:

**Content:**
{content}

**User Request:** {userPrompt}

**Instructions:**
- Focus on the key points and main ideas
- Keep the summary clear and well-structured
- Highlight information most relevant to the user's request
- Use bullet points or numbered lists for better readability
- If the content is technical, explain complex concepts simply`,
    variables: ['content', 'userPrompt']
  },

  analyze: {
    name: 'Content Analysis',
    description: 'Analyze web content for specific insights and patterns',
    template: `Please perform a detailed analysis of the following web content:

**Content:**
{content}

**Analysis Focus:** {userPrompt}

**Instructions:**
- Examine the content structure, key themes, and arguments
- Identify important data points, statistics, or claims
- Highlight strengths, weaknesses, or notable aspects
- Provide insights relevant to the specified analysis focus
- Include quotes or examples from the content when relevant
- Organize your analysis with clear headings and sections`,
    variables: ['content', 'userPrompt']
  },

  extract: {
    name: 'Information Extraction',
    description: 'Extract specific information from web content',
    template: `Please extract specific information from the following web content:

**Content:**
{content}

**Information to Extract:** {userPrompt}

**Instructions:**
- Focus only on information directly related to the extraction request
- Present findings in a structured format (lists, tables, or organized sections)
- Include relevant context when necessary
- If the requested information is not found, clearly state this
- Provide exact quotes or data when available
- Organize extracted information logically`,
    variables: ['content', 'userPrompt']
  },

  compare: {
    name: 'Content Comparison',
    description: 'Compare multiple pieces of web content or compare content to criteria',
    template: `Please compare the following web content based on the specified criteria:

**Content:**
{content}

**Comparison Criteria:** {userPrompt}

**Instructions:**
- Create a structured comparison highlighting similarities and differences
- Use tables, side-by-side analysis, or categorized sections
- Focus on the aspects most relevant to the comparison criteria
- Provide specific examples and evidence from the content
- Conclude with key insights from the comparison
- Be objective and balanced in your assessment`,
    variables: ['content', 'userPrompt']
  },

  research: {
    name: 'Research Assistance',
    description: 'Help with research by analyzing content in context of research questions',
    template: `Please help with research by analyzing the following web content:

**Content:**
{content}

**Research Question/Topic:** {userPrompt}

**Instructions:**
- Identify how the content relates to the research question
- Extract relevant facts, data, and insights
- Note any biases, limitations, or credibility concerns
- Suggest follow-up questions or areas for further research
- Organize findings with proper context and citations
- Highlight the most significant findings for the research topic`,
    variables: ['content', 'userPrompt']
  },

  custom: {
    name: 'Custom Analysis',
    description: 'Custom prompt for specific analysis needs',
    template: `Please analyze the following web content according to the user's specific request:

**Content:**
{content}

**User Request:** {userPrompt}

**Instructions:**
- Follow the user's request as closely as possible
- Provide thorough and accurate analysis
- Structure your response clearly and logically
- Include relevant examples and evidence from the content
- If clarification is needed, ask specific questions`,
    variables: ['content', 'userPrompt']
  }
};

/**
 * Web search result processing prompts
 */
export const WEB_SEARCH_RESULT_PROMPTS: { [key: string]: PromptTemplate } = {
  synthesize: {
    name: 'Search Results Synthesis',
    description: 'Combine multiple search results into a comprehensive answer',
    template: `Based on the following search results, please provide a comprehensive answer:

**Search Query:** {query}
**Search Results:**
{searchResults}

**User Question:** {userPrompt}

**Instructions:**
- Synthesize information from multiple sources
- Present a well-structured, comprehensive answer
- Include source attribution where appropriate
- Highlight any conflicting information between sources
- Organize information logically with clear headings
- Provide actionable insights when relevant`,
    variables: ['query', 'searchResults', 'userPrompt']
  },

  latest_info: {
    name: 'Latest Information Summary',
    description: 'Focus on the most recent and current information',
    template: `Please provide the latest information based on these search results:

**Search Query:** {query}
**Search Results:**
{searchResults}

**Information Request:** {userPrompt}

**Instructions:**
- Prioritize the most recent information
- Note dates and recency when available
- Identify trends or changes over time
- Flag outdated information if present
- Focus on current best practices or latest developments
- Provide a timeline if relevant`,
    variables: ['query', 'searchResults', 'userPrompt']
  }
};

/**
 * Utility function to format prompt templates
 */
export function formatPromptTemplate(
  template: PromptTemplate,
  variables: Record<string, string>
): string {
  let formatted = template.template;
  
  // Replace all template variables
  for (const variable of template.variables) {
    const value = variables[variable] || `[${variable} not provided]`;
    formatted = formatted.replace(new RegExp(`\\{${variable}\\}`, 'g'), value);
  }
  
  return formatted;
}

/**
 * Get appropriate prompt template based on user intent
 */
export function selectPromptTemplate(
  userPrompt: string,
  isSearchResult: boolean = false
): PromptTemplate {
  const prompt = userPrompt.toLowerCase();
  
  if (isSearchResult) {
    if (prompt.includes('latest') || prompt.includes('recent') || prompt.includes('current')) {
      return WEB_SEARCH_RESULT_PROMPTS.latest_info;
    }
    return WEB_SEARCH_RESULT_PROMPTS.synthesize;
  }
  
  // Analyze user intent for content analysis
  if (prompt.includes('summarize') || prompt.includes('summary') || prompt.includes('overview')) {
    return WEB_CONTENT_ANALYSIS_PROMPTS.summarize;
  }
  
  if (prompt.includes('analyze') || prompt.includes('analysis') || prompt.includes('examine')) {
    return WEB_CONTENT_ANALYSIS_PROMPTS.analyze;
  }
  
  if (prompt.includes('extract') || prompt.includes('find') || prompt.includes('list')) {
    return WEB_CONTENT_ANALYSIS_PROMPTS.extract;
  }
  
  if (prompt.includes('compare') || prompt.includes('difference') || prompt.includes('versus')) {
    return WEB_CONTENT_ANALYSIS_PROMPTS.compare;
  }
  
  if (prompt.includes('research') || prompt.includes('investigate') || prompt.includes('study')) {
    return WEB_CONTENT_ANALYSIS_PROMPTS.research;
  }
  
  // Default to custom template
  return WEB_CONTENT_ANALYSIS_PROMPTS.custom;
}

/**
 * Pre-defined analysis templates for common use cases
 */
export const COMMON_ANALYSIS_TEMPLATES = {
  DOCUMENTATION_REVIEW: {
    prompt: "Review this technical documentation and provide a clear summary of the key concepts, installation steps, and usage examples",
    template: WEB_CONTENT_ANALYSIS_PROMPTS.analyze
  },
  
  NEWS_SUMMARY: {
    prompt: "Summarize the main points of this news article, including key facts, implications, and relevant context",
    template: WEB_CONTENT_ANALYSIS_PROMPTS.summarize
  },
  
  TUTORIAL_EXTRACTION: {
    prompt: "Extract the step-by-step instructions and code examples from this tutorial",
    template: WEB_CONTENT_ANALYSIS_PROMPTS.extract
  },
  
  RESEARCH_SYNTHESIS: {
    prompt: "Analyze this content for research purposes, identifying key findings, methodology, and relevance to the topic",
    template: WEB_CONTENT_ANALYSIS_PROMPTS.research
  }
};

/**
 * Content type specific processing hints
 */
export const CONTENT_TYPE_HINTS = {
  'text/html': 'This is HTML content. Focus on the main text content and ignore navigation, ads, and layout elements.',
  'application/json': 'This is JSON data. Parse the structure and highlight key data points and relationships.',
  'text/plain': 'This is plain text content. Analyze the structure and formatting for better understanding.',
  'application/xml': 'This is XML content. Focus on the data structure and key information elements.'
};

export default {
  WEB_CONTENT_ANALYSIS_PROMPTS,
  WEB_SEARCH_RESULT_PROMPTS,
  formatPromptTemplate,
  selectPromptTemplate,
  COMMON_ANALYSIS_TEMPLATES,
  CONTENT_TYPE_HINTS
};