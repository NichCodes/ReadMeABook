/**
 * Component: Audiobook Details Modal Tests, Manual Import from a request card (#278)
 * Documentation: documentation/features/manual-import.md
 */

// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.hoisted(() => vi.fn());
const details = vi.hoisted(() => ({ fromSaved: false }));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ squareCovers: false, setSquareCovers: vi.fn(), cardSize: 5, setCardSize: vi.fn() }),
}));
vi.mock('@/lib/hooks/useAudiobooks', () => ({
  useAudiobookDetails: () => ({
    audiobook: { asin: 'ASIN123', title: 'Detail Book', author: 'Detail Author', description: '', genres: [] },
    fromSaved: details.fromSaved,
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/lib/hooks/useRequests', () => ({
  useCreateRequest: () => ({ createRequest: vi.fn(), isLoading: false }),
  useEbookStatus: () => ({ ebookStatus: { ebookSourcesEnabled: false, hasActiveEbookRequest: false }, revalidate: vi.fn() }),
  useDownloadStatus: () => ({ downloadAvailable: false, requestId: null }),
  useFetchEbookByAsin: () => ({ fetchEbook: vi.fn(), isLoading: false }),
}));
vi.mock('@/components/requests/InteractiveTorrentSearchModal', () => ({ InteractiveTorrentSearchModal: () => null }));
vi.mock('@/components/audiobooks/ManualImportBrowser', () => ({
  ManualImportBrowser: ({ requestType, requestId }: { requestType?: string; requestId?: string }) => (
    <div data-testid="manual-import" data-request-type={requestType ?? ''} data-request-id={requestId ?? ''} />
  ),
}));
vi.mock('next/image', () => ({ __esModule: true, default: () => null }));

async function openManualImport(props: Record<string, unknown>) {
  const { AudiobookDetailsModal } = await import('@/components/audiobooks/AudiobookDetailsModal');
  render(<AudiobookDetailsModal asin="ASIN123" isOpen onClose={vi.fn()} isAvailable={false} {...props} />);
  await act(async () => {});
  fireEvent.click(screen.getByTitle('Manual Import'));
  return screen.getByTestId('manual-import');
}

describe('AudiobookDetailsModal Manual Import', () => {
  beforeEach(() => {
    details.fromSaved = false;
    useAuthMock.mockReturnValue({ user: { id: 'admin-1', username: 'admin', role: 'admin' } });
  });

  // Audible had no details: the window opens from what RMAB saved, so the request can still be imported
  it('a book shown from what RMAB saved says so, has no Audible link, and Manual Import still opens', async () => {
    details.fromSaved = true;
    const browser = await openManualImport({ requestStatus: 'failed', requestId: 'req-ab' });
    expect(screen.getByText('Audible has no details for this book right now. Showing what RMAB saved.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audible' })).toBeNull();
    expect(browser).toHaveAttribute('data-request-type', 'audiobook');
  });

  it('no note for a book Audible knows, and the Audible link shows', async () => {
    await openManualImport({ requestStatus: 'failed' });
    expect(screen.queryByText(/Showing what RMAB saved/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Audible' })).toHaveAttribute('href', expect.stringContaining('/pd/ASIN123'));
  });

  it('an ebook request card opens an ebook import for that request', async () => {
    const browser = await openManualImport({ requestStatus: 'failed', requestId: 'req-eb', requestType: 'ebook' });
    expect(browser).toHaveAttribute('data-request-type', 'ebook');
    expect(browser).toHaveAttribute('data-request-id', 'req-eb');
  });

  it('an audiobook request card opens the audiobook import, as before (no request id)', async () => {
    const browser = await openManualImport({ requestStatus: 'failed', requestId: 'req-ab', requestType: 'audiobook' });
    expect(browser).toHaveAttribute('data-request-type', 'audiobook');
    expect(browser).toHaveAttribute('data-request-id', '');
  });

  it('a book opened without a request imports an audiobook', async () => {
    const browser = await openManualImport({});
    expect(browser).toHaveAttribute('data-request-type', 'audiobook');
    expect(browser).toHaveAttribute('data-request-id', '');
  });
});
