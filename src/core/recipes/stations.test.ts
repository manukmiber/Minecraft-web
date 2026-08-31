import { beforeAll, describe, expect, it } from 'vitest'

import { installBuiltinKinds } from '../kinds'
import { createNode, createProject, upsertNode } from '../model/project'
import type { ProjectModel } from '../model/types'
import {
  DEFAULT_STATION_ID,
  NODE_STATION_PREFIX,
  gridCellIndexes,
  isGridStationId,
  resolveStation,
  stationsFor,
} from './stations'

beforeAll(() => {
  installBuiltinKinds()
})

function projectWithCookware(): { project: ProjectModel; potId: string } {
  let project = createProject({ namespace: 'farm' })
  const pot = createNode(project, 'block', 'Cooking Pot', {
    isCraftingStation: true,
    craftingTag: 'cooking_pot',
    craftingGridRows: 2,
    craftingGridCols: 2,
  })
  project = upsertNode(project, pot)
  return { project, potId: pot.id }
}

describe('stations', () => {
  it('offers the vanilla stations plus every cookware block in the project', () => {
    const { project, potId } = projectWithCookware()
    const ids = stationsFor(project).map((station) => station.id)

    expect(ids).toContain('crafting_table')
    expect(ids).toContain('furnace')
    expect(ids).toContain(`${NODE_STATION_PREFIX}${potId}`)
  })

  it('ignores a block that has not been given a crafting tag', () => {
    let project = createProject({ namespace: 'farm' })
    const shelf = createNode(project, 'block', 'Shelf', { isCraftingStation: true, craftingTag: '' })
    project = upsertNode(project, shelf)

    expect(stationsFor(project).some((station) => station.blockNodeId === shelf.id)).toBe(false)
  })

  it('gives a custom station the block’s own tag and grid size', () => {
    const { project, potId } = projectWithCookware()
    const { station } = resolveStation(project, { station: `${NODE_STATION_PREFIX}${potId}` })

    expect(station.tags).toEqual(['cooking_pot'])
    expect(station.layout).toEqual({ kind: 'grid', rows: 2, cols: 2 })
  })

  it('matches a recipe saved before stations existed onto its station tag', () => {
    const { project } = projectWithCookware()
    const { station, fallback } = resolveStation(project, { stations: ['smoker'] })

    expect(station.id).toBe('smoker')
    expect(fallback).toBe(false)
  })

  it('falls back to the crafting table, and says so, when the station is gone', () => {
    const { project } = projectWithCookware()
    const { station, fallback } = resolveStation(project, { station: 'node:deleted' })

    expect(station.id).toBe(DEFAULT_STATION_ID)
    expect(fallback).toBe(true)
  })

  it('does not report a fallback for a recipe that never picked a station', () => {
    const { project } = projectWithCookware()
    expect(resolveStation(project, {}).fallback).toBe(false)
  })

  it('addresses a narrow grid inside the same 3x3 space', () => {
    // A 2x2 station uses the top-left corner, so widening it later finds the
    // ingredients exactly where they were left.
    expect(gridCellIndexes({ kind: 'grid', rows: 2, cols: 2 })).toEqual([0, 1, 3, 4])
    expect(gridCellIndexes({ kind: 'grid', rows: 1, cols: 3 })).toEqual([0, 1, 2])
  })

  it('knows which stations lay ingredients on a grid', () => {
    expect(isGridStationId('crafting_table')).toBe(true)
    expect(isGridStationId('furnace')).toBe(false)
    expect(isGridStationId(`${NODE_STATION_PREFIX}anything`)).toBe(true)
  })
})
