import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from './AppProviders';

describe('AppProviders', () => {
  it('renders children inside router, query and radix providers', () => {
    render(
      <AppProviders>
        <div>Provider Ready</div>
      </AppProviders>,
    );

    expect(screen.getByText('Provider Ready')).toBeInTheDocument();
  });
});
