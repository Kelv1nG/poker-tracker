import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HandReplayer } from './HandReplayer';
import preflop from '../../../../backend/tests/fixtures/bet88/preflop.json';
import twice from '../../../../backend/tests/fixtures/bet88/run-it-twice.json';
import type { HandPayload } from '../../api/contracts';

const early=preflop as HandPayload,rit=twice as HandPayload;

test('step controls reveal cards and recorded results only when reached, then rewind',async()=>{
  const user=userEvent.setup();render(<HandReplayer payload={early} hero="Tassadar"/>);
  expect(screen.queryByRole('img',{name:'Ace of diamonds'})).not.toBeInTheDocument();
  expect(screen.queryByText('Recorded results')).not.toBeInTheDocument();
  for(let i=0;i<3;i++)await user.click(screen.getByRole('button',{name:'Next'}));
  expect(screen.getByRole('img',{name:'Ace of diamonds'})).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Previous'}));
  expect(screen.queryByRole('img',{name:'Ace of diamonds'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('slider',{name:'Replay step'}),{target:{value:'8'}});
  expect(screen.getByText('Recorded results')).toBeInTheDocument();
  expect(screen.getByText('$0.05')).toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'Start'}));
  expect(screen.queryByText('Recorded results')).not.toBeInTheDocument();
  expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('0');
});

test('both runouts remain visible at the end without five-card results becoming private cards',()=>{
  render(<HandReplayer payload={rit} hero="Tassadar"/>);
  const slider=screen.getByRole('slider',{name:'Replay step'});
  fireEvent.change(slider,{target:{value:slider.getAttribute('max')}});
  const second=screen.getByRole('group',{name:'Board 2'});
  expect(within(second).getByRole('img',{name:'4 of spades'})).toBeInTheDocument();
  const hero=screen.getByRole('group',{name:'Tassadar'});
  expect(within(hero).getAllByRole('img')).toHaveLength(2);
  expect(screen.getByRole('group',{name:'Board 1'})).toBeInTheDocument();
});

test('autoplay pauses on manual controls, survives same-hand polling and resets on a new hand',()=>{
  vi.useFakeTimers();
  try {
    const {rerender,unmount}=render(<HandReplayer payload={early} hero="Tassadar"/>);
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    act(()=>vi.advanceTimersByTime(2000));
    expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('2');
    rerender(<HandReplayer payload={structuredClone(early)} hero="Tassadar"/>);
    act(()=>vi.advanceTimersByTime(1000));
    expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('3');
    fireEvent.click(screen.getByRole('button',{name:'Previous'}));
    act(()=>vi.advanceTimersByTime(2000));
    expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('2');
    expect(screen.getByRole('button',{name:'Play'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    rerender(<HandReplayer payload={rit} hero="Tassadar"/>);
    expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('0');
    expect(screen.getByRole('button',{name:'Play'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    unmount();expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});

test('autoplay stops at the last event',()=>{
  vi.useFakeTimers();
  try {
    render(<HandReplayer payload={early} hero={null}/>);
    fireEvent.click(screen.getByRole('button',{name:'Play'}));
    act(()=>vi.advanceTimersByTime(12000));
    expect(screen.getByRole('slider',{name:'Replay step'})).toHaveValue('8');
    expect(screen.getByRole('button',{name:'Play'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Next'})).toBeDisabled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {vi.useRealTimers();}
});
