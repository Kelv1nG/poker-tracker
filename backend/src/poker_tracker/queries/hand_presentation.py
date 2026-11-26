"""Compact display only: never modifies canonical data or infers private cards."""
BETTING = {'RAISE': 'R', 'CALL': 'C', 'BET': 'B', 'CHECK': 'X', 'FOLD': 'F'}
STREETS = {'Preflop': 'PF', 'Flop': 'F', 'Turn': 'T', 'River': 'R'}


def present_hand(payload: dict, player: str | None) -> dict:
    cards, boards, lines = [], [], []
    for phase in payload['phases']:
        board = phase.get('board', [])
        if board:
            # Extend the most recent compatible board, keeping separate runouts.
            if boards and len(board) > len(boards[-1]) and board[:len(boards[-1])] == boards[-1]:
                boards[-1] = board
            elif not boards or board != boards[-1]:
                boards.append(board)
        actions, descriptions = [], []
        for event in phase['events']:
            if player is None or event.get('player') != player:
                continue
            revealed = event.get('cards', [])
            if len(revealed) == 2 and (event['action'] in ('Was dealt', 'Showing Pocket Cards') or event.get('action_code') == 'SHOW_CARDS'):
                if not cards or sum(c is not None for c in revealed) > sum(c is not None for c in cards):
                    cards = revealed
            code = event.get('action_code')
            if event.get('type') == 'action' and code in BETTING:
                actions.append(BETTING[code])
                descriptions.append(code.capitalize())
        if actions:
            lines.append(dict(street=STREETS.get(phase['name'],phase['name']), actions=actions, description=', '.join(descriptions)))
    return dict(hole_cards=cards, boards=boards, action_line=lines)
