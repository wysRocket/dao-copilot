/**
 * URL Processing Utilities
 * 
 * Utilities for detecting, formatting, and linkifying URLs in text content
 * for use in search results and other interactive components.
 */

import React from 'react';

// Enhanced URL regex that matches various formats
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=]*))/gi;

// Email regex
const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

export interface LinkifyOptions {
  className?: string;
  target?: string;
  rel?: string;
  onClick?: (url: string, event: React.MouseEvent) => void;
  maxLength?: number;
}

/**
 * Detects URLs in text and replaces them with clickable links
 */
export function linkifyText(
  text: string, 
  options: LinkifyOptions = {}
): React.ReactNode[] {
  const {
    className = 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline transition-colors',
    target = '_blank',
    rel = 'noopener noreferrer',
    onClick,
    maxLength = 50
  } = options;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex for fresh matching
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const url = match[0];
    const displayText = url.length > maxLength ? 
      `${url.substring(0, maxLength)}...` : 
      url;

    // Create the link element
    parts.push(
      <a
        key={match.index}
        href={url}
        className={className}
        target={target}
        rel={rel}
        onClick={(e) => {
          if (onClick) {
            e.preventDefault();
            onClick(url, e);
          }
        }}
        title={url} // Show full URL on hover
      >
        {displayText}
      </a>
    );

    lastIndex = URL_REGEX.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 1 ? parts : [text];
}

/**
 * Detects email addresses in text and replaces them with mailto links
 */
export function linkifyEmails(
  text: string,
  className: string = 'text-blue-600 dark:text-blue-400 hover:underline'
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // Reset regex for fresh matching
  EMAIL_REGEX.lastIndex = 0;

  while ((match = EMAIL_REGEX.exec(text)) !== null) {
    // Add text before the email
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const email = match[0];

    // Create the mailto link
    parts.push(
      <a
        key={match.index}
        href={`mailto:${email}`}
        className={className}
        title={`Send email to ${email}`}
      >
        {email}
      </a>
    );

    lastIndex = EMAIL_REGEX.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 1 ? parts : [text];
}

/**
 * Formats a URL for display by removing protocol and www, truncating if needed
 */
export function formatDisplayUrl(url: string, maxLength: number = 50): string {
  try {
    const urlObj = new URL(url);
    let displayUrl = urlObj.hostname + urlObj.pathname + urlObj.search;
    
    // Remove www. prefix
    if (displayUrl.startsWith('www.')) {
      displayUrl = displayUrl.substring(4);
    }
    
    // Truncate if too long
    if (displayUrl.length > maxLength) {
      displayUrl = displayUrl.substring(0, maxLength - 3) + '...';
    }
    
    return displayUrl;
  } catch {
    // Fallback for invalid URLs
    return url.length > maxLength ? url.substring(0, maxLength - 3) + '...' : url;
  }
}

/**
 * Checks if a string contains any URLs
 */
export function containsUrl(text: string): boolean {
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}

/**
 * Extracts all URLs from a text string
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  let match;
  
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    urls.push(match[0]);
  }
  
  return urls;
}

/**
 * Validates if a string is a valid URL
 */
export function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * Component that renders text with linkified URLs and emails
 */
export interface LinkifiedTextProps {
  text: string;
  className?: string;
  linkClassName?: string;
  onLinkClick?: (url: string, event: React.MouseEvent) => void;
  maxUrlLength?: number;
}

export function LinkifiedText({
  text,
  className,
  linkClassName,
  onLinkClick,
  maxUrlLength = 50
}: LinkifiedTextProps): JSX.Element {
  const linkifiedUrls = linkifyText(text, {
    className: linkClassName,
    onClick: onLinkClick,
    maxLength: maxUrlLength
  });

  // If no URLs were found, try emails
  const finalContent = linkifiedUrls.length === 1 && typeof linkifiedUrls[0] === 'string'
    ? linkifyEmails(text, linkClassName)
    : linkifiedUrls;

  return (
    <span className={className}>
      {finalContent}
    </span>
  );
}

export default LinkifiedText;