'use client';

/**
 * Cloche des notifications, avec sa pastille de non-lues.
 *
 * Le décompte se rafraîchit à l'ouverture et toutes les deux minutes : plus
 * souvent solliciterait la base sans bénéfice, moins souvent laisserait passer
 * un changement de garde imminent.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { compterNonLues } from '@/lib/actions';
import { useContexte } from '@/lib/use-contexte';
import { Icone } from './icons';

export function Cloche() {
  const { ctx } = useContexte();
  const [nonLues, setNonLues] = useState(0);

  useEffect(() => {
    if (ctx.etat !== 'pret') return;
    const hid = ctx.contexte.foyer.id;
    let vivant = true;

    const rafraichir = () => {
      compterNonLues(hid).then((r) => {
        if (vivant && r.status === 'ok') setNonLues(r.data);
      });
    };
    rafraichir();
    const minuterie = setInterval(rafraichir, 120_000);
    return () => { vivant = false; clearInterval(minuterie); };
  }, [ctx]);

  const libelle = nonLues > 0
    ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}`
    : 'Notifications';

  return (
    <Link href="/app/notifications" aria-label={libelle}
      className="relative grid h-11 w-11 place-items-center rounded-full text-ink">
      <Icone nom="cloche" taille={23} />
      {nonLues > 0 && (
        <span aria-hidden
          className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#B3423A] px-1 text-[10px] font-black text-white">
          {nonLues > 9 ? '9+' : nonLues}
        </span>
      )}
    </Link>
  );
}
