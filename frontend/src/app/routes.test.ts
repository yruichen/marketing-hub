import { describe, expect, it } from 'vitest';
import { pathForSection, sectionFromPath } from './routes';

describe('app routes', () => {
  it('maps stable sections to shareable paths', () => {
    expect(pathForSection('projects')).toBe('/projects');
    expect(pathForSection('builder')).toBe('/workflows');
    expect(pathForSection('content')).toBe('/generation');
    expect(pathForSection('config')).toBe('/settings');
  });

  it('derives active sections from deep links', () => {
    expect(sectionFromPath('/projects/core-launch')).toBe('projects');
    expect(sectionFromPath('/workflows/default')).toBe('builder');
    expect(sectionFromPath('/generation/storyboard')).toBe('storyboard');
    expect(sectionFromPath('/generation/video')).toBe('video');
    expect(pathForSection('video')).toBe('/generation/video');
    expect(sectionFromPath('/templates/public')).toBe('community');
  });
});
