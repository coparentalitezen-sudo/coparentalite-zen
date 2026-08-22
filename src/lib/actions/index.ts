'use client';

/**
 * Point d'entrée unique de la couche d'accès aux données.
 *
 * Les écrans importent toujours depuis « @/lib/actions » : le découpage interne
 * en modules reste invisible pour eux, et peut évoluer sans rien casser.
 */
export type { ActionResult } from './core';
export * from './types';

export * from './context';
export * from './children';
export * from './custody';
export * from './household';
export * from './balance';
export * from './expenses';
export * from './reimbursements';
export * from './attachments';
export * from './privacy';
export * from './premium';
export * from './partage';
export * from './vacances';
export * from './localisation';
export * from './notifications';
export * from './rendez-vous';
