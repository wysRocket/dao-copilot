/**
 * SearchResultCard Component
 *
 * Displays Google Custom Search results with enhanced formatting, copy
 * actions, and optional rich media.
 */

import React, {useState} from 'react'
import {cn} from '../utils/tailwind'
import GlassCard from './GlassCard'
import {CopyButton} from './CopyButton'

// Inline LinkifiedText component
interface LinkifiedTextProps {
  text: string
  className?: string
  linkClassName?: string
  onLinkClick?: (url: string, e: React.MouseEvent) => void
}

const LinkifiedText: React.FC<LinkifiedTextProps> = ({
  text,
  className,
  linkClassName,
  onLinkClick
}) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (urlRegex.test(part)) {
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={
                linkClassName ||
                'text-blue-400 underline transition-colors duration-200 hover:text-blue-300'
              }
              onClick={e => onLinkClick?.(part, e)}
            >
              {part}
            </a>
          )
        }
        return <span key={index}>{part}</span>
      })}
    </span>
  )
}

// Inline ExpandableText component for collapsible content
interface ExpandableTextProps {
  text: string
  maxLength?: number
  className?: string
  showMoreLabel?: string
  showLessLabel?: string
  onLinkClick?: (url: string, e: React.MouseEvent) => void
}

const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  maxLength = 150,
  className,
  showMoreLabel = 'Show more',
  showLessLabel = 'Show less',
  onLinkClick
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (text.length <= maxLength) {
    return <LinkifiedText text={text} className={className} onLinkClick={onLinkClick} />
  }

  const truncatedText = text.slice(0, maxLength)
  const remainingText = text.slice(maxLength)

  return (
    <div className={className}>
      <LinkifiedText text={truncatedText} onLinkClick={onLinkClick} />

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <LinkifiedText text={remainingText} onLinkClick={onLinkClick} />
      </div>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-blue-400 transition-colors duration-200 hover:text-blue-300"
      >
        {isExpanded ? (
          <>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
            {showLessLabel}
          </>
        ) : (
          <>
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
            {showMoreLabel}
          </>
        )}
      </button>
    </div>
  )
}

// Tooltip Component
interface TooltipProps {
  children: React.ReactNode
  text: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

const Tooltip: React.FC<TooltipProps> = ({children, text, position = 'top'}) => {
  const [isVisible, setIsVisible] = useState(false)

  const positionClasses = {
    top: 'bottom-full mb-2 left-1/2 transform -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 transform -translate-x-1/2',
    left: 'right-full mr-2 top-1/2 transform -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 transform -translate-y-1/2'
  }

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg',
            'animate-fade-in pointer-events-none whitespace-nowrap opacity-0',
            positionClasses[position],
            isVisible && 'opacity-100'
          )}
          style={{
            animation: isVisible
              ? 'fadeIn 0.2s ease-in-out forwards'
              : 'fadeOut 0.2s ease-in-out forwards'
          }}
        >
          {text}
          <div
            className={cn(
              'absolute h-2 w-2 rotate-45 transform bg-gray-800',
              position === 'top' && 'top-full left-1/2 -mt-1 -translate-x-1/2',
              position === 'bottom' && 'bottom-full left-1/2 -mb-1 -translate-x-1/2',
              position === 'left' && 'top-1/2 left-full -ml-1 -translate-y-1/2',
              position === 'right' && 'top-1/2 right-full -mr-1 -translate-y-1/2'
            )}
          />
        </div>
      )}
    </div>
  )
}

// ActionButtons Component
interface ActionButtonsProps {
  result: SearchResult
  className?: string
}

const ActionButtons: React.FC<ActionButtonsProps> = ({result, className}) => {
  const [bookmarked, setBookmarked] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleBookmark = () => {
    setBookmarked(!bookmarked)
    // TODO: Integrate with actual bookmark storage
    console.log(bookmarked ? 'Removed bookmark:' : 'Bookmarked:', result.title)
  }

  const handleSave = () => {
    setSaved(!saved)
    // TODO: Integrate with actual save storage
    console.log(saved ? 'Removed from saved:' : 'Saved:', result.title)
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: result.title,
          text: result.snippet,
          url: result.link
        })
      } catch {
        console.log('Share cancelled or failed')
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(result.link)
        // Could show a toast notification here
        console.log('Link copied to clipboard')
      } catch {
        console.error('Failed to copy link')
      }
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100',
        className
      )}
    >
      <Tooltip text={bookmarked ? 'Remove bookmark' : 'Bookmark this result'}>
        <button
          onClick={handleBookmark}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200 hover:scale-110',
            bookmarked
              ? 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'
              : 'text-gray-400 hover:bg-yellow-400/10 hover:text-yellow-400'
          )}
          aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark'}
        >
          <svg
            className="h-4 w-4"
            fill={bookmarked ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>
      </Tooltip>

      <Tooltip text={saved ? 'Remove from saved' : 'Save for later'}>
        <button
          onClick={handleSave}
          className={cn(
            'rounded-md p-1.5 transition-all duration-200 hover:scale-110',
            saved
              ? 'bg-green-400/10 text-green-400 hover:bg-green-400/20'
              : 'text-gray-400 hover:bg-green-400/10 hover:text-green-400'
          )}
          aria-label={saved ? 'Remove from saved' : 'Save'}
        >
          <svg
            className="h-4 w-4"
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
            />
          </svg>
        </button>
      </Tooltip>

      <Tooltip text="Share this result">
        <button
          onClick={handleShare}
          className="rounded-md p-1.5 text-gray-400 transition-all duration-200 hover:scale-110 hover:bg-blue-400/10 hover:text-blue-400"
          aria-label="Share"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
            />
          </svg>
        </button>
      </Tooltip>
    </div>
  )
}

// ImageGallery Component for results with multiple images
interface ImageGalleryProps {
  images: Array<{src: string; alt?: string; title?: string}>
  className?: string
}

const ImageGallery: React.FC<ImageGalleryProps> = ({images, className}) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (!images || images.length === 0) return null

  const openModal = (index: number) => {
    setSelectedIndex(index)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const nextImage = () => {
    setSelectedIndex(prev => (prev + 1) % images.length)
  }

  const prevImage = () => {
    setSelectedIndex(prev => (prev - 1 + images.length) % images.length)
  }

  return (
    <div className={cn('image-gallery', className)}>
      {/* Thumbnail grid */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {images.slice(0, 6).map((image, index) => (
          <div
            key={index}
            className="group relative cursor-pointer"
            onClick={() => openModal(index)}
          >
            <img
              src={image.src}
              alt={image.alt || `Image ${index + 1}`}
              className="h-20 w-full rounded-lg object-cover transition-transform duration-200 hover:scale-105"
              loading="lazy"
            />
            {index === 5 && images.length > 6 && (
              <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 font-semibold text-white">
                +{images.length - 5}
              </div>
            )}
            <div className="absolute inset-0 rounded-lg bg-black/0 transition-colors duration-200 group-hover:bg-black/20" />
          </div>
        ))}
      </div>

      {/* Modal for full-size viewing */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={closeModal}
        >
          <div className="relative mx-4 max-h-[90vh] max-w-4xl" onClick={e => e.stopPropagation()}>
            <img
              src={images[selectedIndex].src}
              alt={images[selectedIndex].alt || `Image ${selectedIndex + 1}`}
              className="max-h-full max-w-full object-contain"
            />

            {/* Navigation buttons */}
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={nextImage}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </>
            )}

            {/* Close button */}
            <button
              onClick={closeModal}
              className="absolute top-2 right-2 rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ExpandableAnswerBox for detailed content
interface ExpandableAnswerBoxProps {
  title: string
  content: string
  sources?: Array<{title: string; url: string}>
  className?: string
}

const ExpandableAnswerBox: React.FC<ExpandableAnswerBoxProps> = ({
  title,
  content,
  sources,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={cn(
        'expandable-answer-box rounded-lg border border-blue-200 dark:border-blue-800',
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
      >
        <div>
          <h3 className="font-semibold text-blue-700 dark:text-blue-300">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-gray-400">
            {content.slice(0, 150)}...
          </p>
        </div>
        <svg
          className={cn('h-5 w-5 text-blue-500 transition-transform', isExpanded && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-blue-200 px-4 pb-4 dark:border-blue-800">
          <div className="pt-4">
            <LinkifiedText text={content} />

            {sources && sources.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Sources:
                </h4>
                <ul className="space-y-1">
                  {sources.map((source, index) => (
                    <li key={index}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// TabbedInterface for organizing different types of content
interface TabData {
  id: string
  label: string
  content: React.ReactNode
  icon?: React.ReactNode
}

interface TabbedInterfaceProps {
  tabs: TabData[]
  defaultTab?: string
  className?: string
}

const TabbedInterface: React.FC<TabbedInterfaceProps> = ({tabs, defaultTab, className}) => {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const activeTabData = tabs.find(tab => tab.id === activeTab)

  return (
    <div className={cn('tabbed-interface', className)}>
      {/* Tab headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            {tab.icon && <span>{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-4">{activeTabData?.content}</div>
    </div>
  )
}

export interface SearchResult {
  title: string
  snippet: string
  link: string
  displayLink?: string
  formattedUrl?: string
  pagemap?: {
    cse_thumbnail?: Array<{src: string; width: string; height: string}>
    metatags?: Array<{[key: string]: string}>
  }
}

export interface SearchResultCardProps {
  result: SearchResult
  className?: string
  compact?: boolean
  onLinkClick?: (url: string) => void
}

export function SearchResultCard({
  result,
  className,
  compact = false,
  onLinkClick
}: SearchResultCardProps) {
  const handleLinkClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (onLinkClick) {
      onLinkClick(result.link)
    } else {
      window.open(result.link, '_blank', 'noopener,noreferrer')
    }
  }

  const displayUrl = result.displayLink || result.formattedUrl || new URL(result.link).hostname
  const thumbnail = result.pagemap?.cse_thumbnail?.[0]

  // Detect special content types
  const hasMultipleImages = result.pagemap?.cse_thumbnail && result.pagemap.cse_thumbnail.length > 1
  const hasRichContent = result.snippet && result.snippet.length > 300

  // Prepare image gallery data
  const galleryImages = hasMultipleImages
    ? result.pagemap!.cse_thumbnail!.map((img, index) => ({
        src: img.src,
        alt: `${result.title} - Image ${index + 1}`,
        title: result.title
      }))
    : []

  // Create tabs for rich content
  const contentTabs = hasRichContent
    ? [
        {
          id: 'overview',
          label: 'Overview',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          ),
          content: (
            <ExpandableText
              text={result.snippet}
              maxLength={200}
              className="text-gray-600 dark:text-gray-300"
              onLinkClick={(url, e) => {
                e.stopPropagation()
                window.open(url, '_blank', 'noopener,noreferrer')
              }}
            />
          )
        },
        {
          id: 'details',
          label: 'Details',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          ),
          content: (
            <div className="space-y-3">
              <div>
                <strong className="text-sm text-gray-700 dark:text-gray-300">Source:</strong>
                <p className="text-sm text-gray-600 dark:text-gray-400">{displayUrl}</p>
              </div>
              {result.pagemap?.metatags?.[0] && (
                <div>
                  <strong className="text-sm text-gray-700 dark:text-gray-300">Description:</strong>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {result.pagemap.metatags[0]['og:description'] ||
                      result.pagemap.metatags[0].description ||
                      'No description available'}
                  </p>
                </div>
              )}
            </div>
          )
        }
      ]
    : []

  return (
    <div
      className={cn(
        'group cursor-pointer transition-all duration-200 ease-out',
        'hover:scale-[1.01] hover:shadow-lg sm:hover:scale-[1.02]',
        'w-full max-w-none', // Ensure full width utilization
        className
      )}
      onClick={handleLinkClick}
    >
      <GlassCard className={compact ? 'p-2 sm:p-3' : 'p-3 sm:p-4'}>
        <div
          className={cn(
            'flex gap-2 sm:gap-3',
            compact ? 'flex-col sm:flex-row' : 'flex-col md:flex-row'
          )}
        >
          {/* Thumbnail if available (responsive positioning) */}
          {!compact && thumbnail && (
            <div className={cn('flex-shrink-0', 'mb-2 h-32 w-full md:mb-0 md:h-16 md:w-16')}>
              <img
                src={thumbnail.src}
                alt=""
                className="h-full w-full rounded-lg object-cover"
                loading="lazy"
                onError={e => {
                  // Hide thumbnail if it fails to load
                  ;(e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            {/* Title - responsive text sizing */}
            <h3
              className={cn(
                'font-semibold text-blue-600 transition-colors group-hover:text-blue-700 dark:text-blue-400 dark:group-hover:text-blue-300',
                'line-clamp-2 sm:line-clamp-3', // More lines on larger screens
                compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base lg:text-lg'
              )}
            >
              {result.title}
            </h3>

            {/* URL with copy functionality */}
            <div
              className={cn(
                'mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2',
                compact ? 'text-xs' : 'text-xs sm:text-sm'
              )}
            >
              <div className="order-1 flex-1 truncate text-green-600 sm:order-0 dark:text-green-400">
                {displayUrl}
              </div>
              <CopyButton
                text={result.link}
                variant="inline"
                showLabel
                label="Copy URL"
                className="order-0 self-start rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/70 transition-opacity duration-200 hover:bg-white/20 hover:text-white sm:order-1 sm:self-auto sm:opacity-0"
              />
            </div>

            {/* Snippet with expandable content or specialized components */}
            <div
              className={cn(
                'mt-2 leading-relaxed',
                compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
              )}
            >
              {/* Show image gallery for results with multiple images - mobile responsive */}
              {hasMultipleImages && !compact && (
                <div className="mb-3">
                  <ImageGallery images={galleryImages} className="mb-2" />
                </div>
              )}

              {/* Show tabbed interface for rich content - responsive logic */}
              {hasRichContent && !compact ? (
                <div className="hidden sm:block">
                  <TabbedInterface tabs={contentTabs} defaultTab="overview" className="mb-3" />
                </div>
              ) : null}

              {/* Always show expandable text as fallback or primary content */}
              {!hasRichContent || compact ? (
                <ExpandableText
                  text={result.snippet}
                  maxLength={compact ? 80 : 200}
                  className="text-gray-600 dark:text-gray-300"
                  onLinkClick={(url, e) => {
                    e.stopPropagation() // Prevent triggering the card click
                    window.open(url, '_blank', 'noopener,noreferrer')
                  }}
                />
              ) : (
                // Mobile version of rich content (simplified expandable text)
                <div className="block sm:hidden">
                  <ExpandableText
                    text={result.snippet}
                    maxLength={150}
                    className="text-gray-600 dark:text-gray-300"
                    onLinkClick={(url, e) => {
                      e.stopPropagation()
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }}
                  />
                </div>
              )}
            </div>

            {/* Show expandable answer box for informational content */}
            {result.snippet.includes('?') && result.snippet.length > 150 && !compact && (
              <div className="mt-3">
                <ExpandableAnswerBox
                  title="More Information"
                  content={result.snippet}
                  sources={[{title: result.title, url: result.link}]}
                />
              </div>
            )}

            {/* Bottom section with actions - responsive layout */}
            <div
              className={cn(
                'mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0',
                'border-t border-transparent pt-2 group-hover:border-gray-200 dark:group-hover:border-gray-700'
              )}
            >
              <div className="order-2 flex items-center gap-2 sm:order-1">
                <div
                  className={cn(
                    'hidden text-gray-400 sm:inline dark:text-gray-500',
                    compact ? 'text-xs' : 'text-sm'
                  )}
                >
                  Click to open
                </div>
                <CopyButton
                  text={result.snippet}
                  variant="inline"
                  showLabel
                  label="Copy snippet"
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/70 transition-opacity duration-200 hover:bg-white/20 hover:text-white sm:opacity-0"
                />
              </div>

              <div className="order-1 flex items-center justify-between gap-2 sm:order-2 sm:justify-end">
                {/* Action buttons for bookmark, save, share */}
                <ActionButtons result={result} />

                {/* External link icon */}
                <div className="text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-400">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M7 7l6-6M13 1h-6v6" />
                    <path d="M5 15H1V1h4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

/**
 * SearchResultsGrid Component
 *
 * Container component that displays multiple search results in a clean grid layout
 */
export interface SearchResultsGridProps {
  results: SearchResult[]
  className?: string
  compact?: boolean
  maxResults?: number
  onLinkClick?: (url: string) => void
  title?: string
}

export function SearchResultsGrid({
  results,
  className,
  compact = false,
  maxResults,
  onLinkClick,
  title = 'Search Results'
}: SearchResultsGridProps) {
  const displayResults = maxResults ? results.slice(0, maxResults) : results

  if (results.length === 0) {
    return (
      <GlassCard className={cn('p-4 text-center', className)}>
        <p className="text-gray-500 dark:text-gray-400">No search results found</p>
      </GlassCard>
    )
  }

  return (
    <div className={cn('w-full', className)}>
      {/* Header - responsive layout */}
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
        <h2 className="text-base font-semibold text-gray-800 sm:text-lg dark:text-gray-200">
          {title}
        </h2>
        <span className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">
          {results.length} result{results.length !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* Results Grid - responsive spacing */}
      <div
        className={cn(
          'space-y-2 sm:space-y-3',
          // Add responsive grid option for larger screens if compact
          compact && 'lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0'
        )}
      >
        {displayResults.map((result, index) => (
          <SearchResultCard
            key={`${result.link}-${index}`}
            result={result}
            compact={compact}
            onLinkClick={onLinkClick}
            className={cn(
              'transition-all duration-200',
              // Add hover effects for larger screens
              'hover:shadow-md sm:hover:shadow-lg'
            )}
          />
        ))}
      </div>

      {/* Show more indicator - responsive text */}
      {maxResults && results.length > maxResults && (
        <div className="mt-3 text-center sm:mt-4">
          <p className="text-xs text-gray-500 sm:text-sm dark:text-gray-400">
            ... and {results.length - maxResults} more result
            {results.length - maxResults !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

export default SearchResultCard
