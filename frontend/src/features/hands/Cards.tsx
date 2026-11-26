import type { Card } from '../../api/contracts';

const suits:Record<string,{symbol:string;name:string;red:boolean}>={
  c:{symbol:'♣',name:'clubs',red:false},d:{symbol:'♦',name:'diamonds',red:true},
  h:{symbol:'♥',name:'hearts',red:true},s:{symbol:'♠',name:'spades',red:false},
};
const ranks:Record<string,string>={T:'10',J:'Jack',Q:'Queen',K:'King',A:'Ace'};

export function Cards({cards}:{cards:Card[]}) {
  return <span className="cards">{cards.map((card,index)=>{
    if(card===null)return <span key={index} className="playing-card unknown" role="img" aria-label="Unknown card">?</span>;
    const rank=card.slice(0,-1),suit=suits[card.slice(-1)];
    return <span key={index} role="img" aria-label={`${ranks[rank]??rank} of ${suit.name}`} className={`playing-card ${suit.red?'red':'black'}`}>{rank==='T'?'10':rank}{suit.symbol}</span>;
  })}</span>;
}
