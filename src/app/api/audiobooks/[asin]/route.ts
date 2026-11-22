/**
 * Component: Audiobook Details API Route
 * Documentation: documentation/integrations/audible.md
 *
 * When Audible has no details (delisted book, Audible down, wrong ASIN), falls back to what RMAB
 * saved: the requested book's row, else the Audible cache. The response then says `source: 'saved'`,
 * so the details window still opens (and an admin can still run Manual Import).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAudibleService, type AudibleAudiobook } from '@/lib/integrations/audible.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('API.Audiobooks.Details');

const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

/** The book as RMAB saved it: a requested book's row first (newest), then the Audible cache. */
async function savedDetails(asin: string): Promise<AudibleAudiobook | null> {
  const book = await prisma.audiobook.findFirst({ where: { audibleAsin: asin }, orderBy: { updatedAt: 'desc' } });
  if (book) {
    return {
      asin,
      title: book.title,
      author: book.author,
      narrator: orUndefined(book.narrator),
      description: orUndefined(book.description),
      coverArtUrl: orUndefined(book.coverArtUrl),
      series: orUndefined(book.series),
      seriesPart: orUndefined(book.seriesPart),
      seriesAsin: orUndefined(book.seriesAsin),
    };
  }
  const cached = await prisma.audibleCache.findUnique({ where: { asin } });
  if (!cached) return null;
  return {
    asin,
    title: cached.title,
    author: cached.author,
    narrator: orUndefined(cached.narrator),
    description: orUndefined(cached.description),
    coverArtUrl: orUndefined(cached.coverArtUrl),
    durationMinutes: orUndefined(cached.durationMinutes),
    releaseDate: cached.releaseDate?.toISOString(),
    rating: cached.rating != null ? Number(cached.rating) : undefined,
    genres: Array.isArray(cached.genres) ? cached.genres.filter((g): g is string => typeof g === 'string') : undefined,
  };
}

/**
 * GET /api/audiobooks/[asin]
 * Get detailed information for a specific audiobook
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asin: string }> }
) {
  try {
    const { asin } = await params;

    if (!asin || asin.length !== 10) {
      return NextResponse.json(
        {
          error: 'ValidationError',
          message: 'Valid ASIN is required',
        },
        { status: 400 }
      );
    }

    const audibleService = getAudibleService();
    let lookupError: unknown = null;
    const audiobook = await audibleService.getAudiobookDetails(asin).catch((error: unknown) => {
      lookupError = error;
      return null;
    });

    if (audiobook) {
      return NextResponse.json({
        success: true,
        audiobook,
        audibleBaseUrl: audibleService.getBaseUrl(),
      });
    }

    const saved = await savedDetails(asin);
    if (saved) {
      logger.info(`No Audible details for ${asin}; showing what RMAB saved`);
      return NextResponse.json({
        success: true,
        audiobook: saved,
        source: 'saved',
        audibleBaseUrl: audibleService.getBaseUrl(),
      });
    }
    if (lookupError) throw lookupError;

    return NextResponse.json(
      {
        error: 'NotFound',
        message: 'Audiobook not found',
      },
      { status: 404 }
    );
  } catch (error) {
    logger.error('Failed to get audiobook details', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        error: 'FetchError',
        message: 'Failed to fetch audiobook details',
      },
      { status: 500 }
    );
  }
}
