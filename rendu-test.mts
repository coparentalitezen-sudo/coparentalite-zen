import { genererSemaine } from './src/lib/marketing/generateur';
import { rendreVisuel } from './src/lib/marketing/rendu';
import { writeFileSync } from 'fs';
const BASE='https://coparentalitezen.fr';
const quiz=[0,1,2,3].flatMap(n=>genererSemaine(new Date(2026,0,5+n*7),BASE)).find(c=>c.categorie==='quiz')!;
const derniere = quiz.pages.length - 1;
const r = await rendreVisuel(quiz, derniere, 'carre');
writeFileSync('/mnt/user-data/outputs/planche-finale.png', Buffer.from(await r.arrayBuffer()));
console.log('rendu OK, planche', derniere + 1, 'sur', quiz.pages.length);
