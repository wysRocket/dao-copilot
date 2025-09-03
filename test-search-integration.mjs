// Test script to validate SearchResultCard integration
import {parseGoogleSearchResults, formatToolCallForChat} from '../src/utils/toolCallParser'

// Sample Google search response
const sampleSearchResponse = {
  items: [
    {
      title: 'React Documentation - Getting Started with React',
      snippet: 'A JavaScript library for building user interfaces. Learn React from the ground up.',
      link: 'https://reactjs.org/docs/getting-started.html',
      displayLink: 'reactjs.org'
    },
    {
      title: 'TypeScript Handbook - Basic Types',
      snippet: 'TypeScript extends JavaScript by adding type definitions. Learn about basic types.',
      link: 'https://www.typescriptlang.org/docs/handbook/basic-types.html',
      displayLink: 'typescriptlang.org'
    },
    {
      title: 'MDN Web Docs - JavaScript Guide',
      snippet: 'A comprehensive guide to JavaScript programming language features.',
      link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
      displayLink: 'developer.mozilla.org'
    }
  ]
}

console.log('Testing Google Search Results Parser:')
console.log('=====================================')

// Test parsing
const parsedResults = parseGoogleSearchResults(sampleSearchResponse)
console.log('Parsed Results:', JSON.stringify(parsedResults, null, 2))

// Test formatting for chat
const chatFormat = formatToolCallForChat('google_search', sampleSearchResponse)
console.log('\nChat Format Result:')
console.log('Component:', chatFormat.component)
console.log('Fallback Text:', chatFormat.fallbackText)
console.log('Props Keys:', Object.keys(chatFormat.props))

console.log('\n✅ Integration test complete - components should render search results properly')
