/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/camelcase */

import { patchVerifyMessage } from '../patches';
patchVerifyMessage();

import { AsyncSubject, BehaviorSubject, of, timer, EMPTY, Subject } from 'rxjs';
import { first, tap, takeUntil, toArray } from 'rxjs/operators';
import { fakeSchedulers } from 'rxjs-marbles/jest';
import { getType } from 'typesafe-actions';
import { verifyMessage, BigNumber } from 'ethers/utils';

import { RaidenAction } from 'raiden-ts/actions';
import { raidenReducer } from 'raiden-ts/reducer';
import { RaidenState } from 'raiden-ts/state';
import { channelMonitored } from 'raiden-ts/channels/actions';
import {
  matrixRequestMonitorPresence,
  matrixPresenceUpdate,
  matrixRoom,
  matrixSetup,
  matrixRequestMonitorPresenceFailed,
  matrixRoomLeave,
} from 'raiden-ts/transport/actions';
import {
  messageSend,
  messageReceived,
  messageSent,
  messageGlobalSend,
} from 'raiden-ts/messages/actions';

import {
  matrixMonitorChannelPresenceEpic,
  matrixShutdownEpic,
  matrixMonitorPresenceEpic,
  matrixPresenceUpdateEpic,
  matrixCreateRoomEpic,
  matrixInviteEpic,
  matrixHandleInvitesEpic,
  matrixLeaveExcessRoomsEpic,
  matrixLeaveUnknownRoomsEpic,
  matrixCleanLeftRoomsEpic,
  matrixMessageSendEpic,
  matrixMessageReceivedEpic,
  matrixMessageReceivedUpdateRoomEpic,
  matrixStartEpic,
  deliveredEpic,
  matrixMessageGlobalSendEpic,
} from 'raiden-ts/transport/epics';
import { MessageType, Delivered } from 'raiden-ts/messages/types';
import { makeMessageId } from 'raiden-ts/transfers/utils';
import { encodeJsonMessage, signMessage } from 'raiden-ts/messages/utils';

import { epicFixtures } from '../fixtures';
import { raidenEpicDeps } from '../mocks';

describe('transport epic', () => {
  const depsMock = raidenEpicDeps();
  const {
    token,
    tokenNetwork,
    channelId,
    partner,
    state,
    matrixServer,
    partnerRoomId,
    partnerUserId,
    partnerSigner,
    matrix,
    userId,
    accessToken,
    deviceId,
    displayName,
    processed,
  } = epicFixtures(depsMock);

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('matrixMonitorChannelPresenceEpic', () => {
    test('channelMonitored triggers matrixRequestMonitorPresence', async () => {
      const action$ = of<RaidenAction>(
        channelMonitored({ id: channelId }, { tokenNetwork, partner }),
      );
      const promise = matrixMonitorChannelPresenceEpic(action$).toPromise();
      await expect(promise).resolves.toEqual(
        matrixRequestMonitorPresence(undefined, { address: partner }),
      );
    });
  });

  describe('matrixStartEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('startClient called on MATRIX_SETUP', async () => {
      expect.assertions(4);
      expect(matrix.startClient).not.toHaveBeenCalled();
      await expect(
        matrixStartEpic(
          of(
            matrixSetup({
              server: matrixServer,
              setup: { userId, accessToken, deviceId, displayName },
            }),
          ),
          EMPTY,
          depsMock,
        ).toPromise(),
      ).resolves.toBeUndefined();
      expect(matrix.startClient).toHaveBeenCalledTimes(1);
      expect(matrix.startClient).toHaveBeenCalledWith(
        expect.objectContaining({ initialSyncLimit: 0 }),
      );
    });
  });

  describe('matrixShutdownEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('stopClient called on action$ completion', async () => {
      expect.assertions(3);
      expect(matrix.stopClient).not.toHaveBeenCalled();
      await expect(
        matrixShutdownEpic(EMPTY, EMPTY, depsMock).toPromise(),
      ).resolves.toBeUndefined();
      expect(matrix.stopClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixMonitorPresenceEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('fails when users does not have displayName', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: undefined,
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have valid addresses', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: `@${token}:${matrixServer}`,
          displayName: 'display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: `@invalidUser:${matrixServer}`, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when users does not have presence or unknown address', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'display_name',
          presence: undefined,
          lastPresenceTs: 123,
        },
      ]);
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('fails when verifyMessage throws', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);

      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [{ user_id: partnerUserId, display_name: 'display_name' }],
      }));
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });
      (verifyMessage as jest.Mock).mockImplementationOnce(() => {
        throw new Error('invalid signature');
      });

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixRequestMonitorPresenceFailed),
        payload: expect.any(Error),
        error: true,
        meta: { address: partner },
      });
    });

    test('success with previously monitored user', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          matrixRequestMonitorPresence(undefined, { address: partner }),
        ),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success with matrix cached user', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);
      matrix.getUsers.mockImplementationOnce(() => [
        {
          userId: partnerUserId,
          displayName: 'partner_display_name',
          presence: 'online',
          lastPresenceTs: 123,
        },
      ]);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success with searchUserDirectory and getUserPresence', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);
      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('success even if some getUserPresence fails', async () => {
      expect.assertions(1);
      const action$ = of(matrixRequestMonitorPresence(undefined, { address: partner })),
        state$ = of(state);

      matrix.searchUserDirectory.mockImplementationOnce(async () => ({
        limited: false,
        results: [
          { user_id: `@${partner.toLowerCase()}.2:${matrixServer}`, display_name: '2' },
          { user_id: partnerUserId, display_name: '1' },
        ],
      }));
      matrix._http.authedRequest.mockRejectedValueOnce(new Error('Could not fetch presence'));

      await expect(
        matrixMonitorPresenceEpic(action$, state$, depsMock).toPromise(),
      ).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: true, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });
  });

  describe('matrixPresenceUpdateEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('success presence update', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixPresenceUpdate),
        payload: { userId: partnerUserId, available: false, ts: expect.any(Number) },
        meta: { address: partner },
      });
    });

    test('update without changing availability does not emit', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({ userId, presence: 'unavailable' }));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    test('cached displayName but invalid signature', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getUser.mockImplementationOnce(userId => ({
        userId,
        presence: 'offline',
        displayName: `partner_display_name`,
      }));
      (verifyMessage as jest.Mock).mockReturnValueOnce(token);

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });

    test('getProfileInfo error', async () => {
      expect.assertions(1);
      const action$ = of(
          matrixRequestMonitorPresence(undefined, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      matrix.getProfileInfo.mockRejectedValueOnce(new Error('could not get user profile'));

      const promise = matrixPresenceUpdateEpic(action$, state$, depsMock)
        .pipe(takeUntil(timer(50)))
        .toPromise();

      matrix.emit('event', {
        getType: () => 'm.presence',
        getSender: () => partnerUserId,
      });

      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('matrixCreateRoomEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('success: concurrent messages create single room', async () => {
      expect.assertions(2);
      const action$ = of(
          messageSend({ message: 'message1' }, { address: partner }),
          messageSend({ message: 'message2' }, { address: partner }),
          messageSend({ message: 'message3' }, { address: partner }),
          messageSend({ message: 'message4' }, { address: partner }),
          messageSend({ message: 'message5' }, { address: partner }),
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = new BehaviorSubject(state);

      const promise = matrixCreateRoomEpic(action$, state$, depsMock)
        .pipe(
          // update state with action, to ensure serial handling knows about already created room
          tap(action => state$.next(raidenReducer(state, action))),
          takeUntil(timer(50)),
        )
        .toPromise();

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoom),
        payload: { roomId: expect.stringMatching(new RegExp(`^!.*:${matrixServer}$`)) },
        meta: { address: partner },
      });
      // ensure multiple concurrent messages only create a single room
      expect(matrix.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('matrixInviteEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('do not invite if there is no room for user', async () => {
      expect.assertions(2);
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state);

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).not.toHaveBeenCalled();
    });

    test('invite if there is room for user', async () => {
      expect.assertions(3);
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const promise = matrixInviteEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.invite).toHaveBeenCalledTimes(1);
      expect(matrix.invite).toHaveBeenCalledWith(roomId, partnerUserId);
    });
  });

  describe('matrixHandleInvitesEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('accept & join from previous presence', async () => {
      expect.assertions(3);
      const action$ = of(
          matrixPresenceUpdate(
            { userId: partnerUserId, available: true, ts: 123 },
            { address: partner },
          ),
        ),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoom),
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('accept & join from late presence', async () => {
      expect.assertions(3);
      const action$ = new Subject<RaidenAction>(),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      action$.next(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
      );

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoom),
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.joinRoom).toHaveBeenCalledTimes(1);
      expect(matrix.joinRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ syncRoom: true }),
      );
    });

    test('do not accept invites from non-monitored peers', async () => {
      expect.assertions(2);
      const action$ = of<RaidenAction>(),
        state$ = of(state),
        roomId = partnerRoomId;

      const promise = matrixHandleInvitesEpic(action$, state$, depsMock)
        .pipe(
          first(),
          takeUntil(timer(100)),
        )
        .toPromise();

      matrix.emit(
        'RoomMember.membership',
        { getSender: () => partnerUserId },
        { roomId, userId, membership: 'invite' },
      );

      await expect(promise).resolves.toBeUndefined();
      expect(matrix.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('matrixLeaveExcessRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('leave rooms behind threshold', async () => {
      expect.assertions(3);
      const roomId = partnerRoomId,
        action = matrixRoom(
          { roomId: `!frontRoomId_for_partner:${matrixServer}` },
          { address: partner },
        ),
        action$ = of(action),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            matrixRoom({ roomId: `!roomId2:${matrixServer}` }, { address: partner }),
            matrixRoom({ roomId: `!roomId3:${matrixServer}` }, { address: partner }),
            action,
          ].reduce(raidenReducer, state),
        );

      const promise = matrixLeaveExcessRoomsEpic(action$, state$, depsMock).toPromise();

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoomLeave),
        payload: { roomId },
        meta: { address: partner },
      });
      expect(matrix.leave).toHaveBeenCalledTimes(1);
      expect(matrix.leave).toHaveBeenCalledWith(roomId);
    });
  });

  describe('matrixLeaveUnknownRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();

      jest.useFakeTimers();
    });

    test(
      'leave unknown rooms',
      fakeSchedulers(advance => {
        expect.assertions(3);
        const roomId = `!unknownRoomId:${matrixServer}`,
          state$ = of(state);

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        expect(matrix.leave).toHaveBeenCalledTimes(1);
        expect(matrix.leave).toHaveBeenCalledWith(roomId);

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave discovery room',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = `!discoveryRoomId:${matrixServer}`,
          state$ = of(state),
          name = `#raiden_${depsMock.network.name}_discovery:${matrixServer}`;

        matrix.getRoom.mockReturnValueOnce({
          roomId,
          name,
          getMember: jest.fn(),
          getJoinedMembers: jest.fn(() => []),
          getCanonicalAlias: jest.fn(() => name),
          getAliases: jest.fn(() => []),
        });

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        // even after some time, discovery room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );

    test(
      'do not leave peers rooms',
      fakeSchedulers(advance => {
        expect.assertions(2);

        const roomId = partnerRoomId,
          state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

        const sub = matrixLeaveUnknownRoomsEpic(EMPTY, state$, depsMock).subscribe();

        matrix.emit('Room', { roomId });

        advance(1e3);

        // we should wait a little before leaving rooms
        expect(matrix.leave).not.toHaveBeenCalled();

        advance(60e3);

        // even after some time, partner's room isn't left
        expect(matrix.leave).not.toHaveBeenCalled();

        sub.unsubscribe();
      }),
    );
  });

  describe('matrixCleanLeftRoomsEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('clean left rooms', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      const promise = matrixCleanLeftRoomsEpic(EMPTY, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit('Room.myMembership', { roomId }, 'leave');

      await expect(promise).resolves.toMatchObject({
        type: getType(matrixRoomLeave),
        payload: { roomId },
        meta: { address: partner },
      });
    });
  });

  describe('matrixMessageSendEpic', () => {
    beforeEach(() => {
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('send: all needed objects in place', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = processed,
        signed = await signMessage(depsMock.signer, message),
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          messageSend({ message: signed }, { address: partner }),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      matrix.getRoom.mockReturnValueOnce({
        roomId,
        name: roomId,
        getMember: jest.fn(userId => ({
          roomId,
          userId,
          name: userId,
          membership: 'join',
          user: null,
        })),
        getJoinedMembers: jest.fn(() => []),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      });

      expect(matrixMessageSendEpic(action$, state$, depsMock).toPromise()).resolves.toMatchObject(
        messageSent({ message: signed }, { address: partner }),
      );
      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: expect.stringMatching('"Processed"'), msgtype: 'm.text' }),
        expect.anything(),
      );
    });

    test('send: Room appears late, user joins late', async () => {
      expect.assertions(3);

      const roomId = partnerRoomId,
        message = 'test message',
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
          messageSend({ message }, { address: partner }),
        ),
        state$ = of(raidenReducer(state, matrixRoom({ roomId }, { address: partner })));

      matrix.getRoom.mockReturnValueOnce(null);

      const sub = matrixMessageSendEpic(action$, state$, depsMock).subscribe();

      expect(matrix.sendEvent).not.toHaveBeenCalled();

      // a wild Room appears
      matrix.emit('Room', {
        roomId,
        name: roomId,
        getMember: jest.fn(),
        getJoinedMembers: jest.fn(),
        getCanonicalAlias: jest.fn(() => roomId),
        getAliases: jest.fn(() => []),
      });

      // user joins later
      matrix.emit(
        'RoomMember.membership',
        {},
        { roomId, userId: partnerUserId, name: partnerUserId, membership: 'join' },
      );

      expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
      expect(matrix.sendEvent).toHaveBeenCalledWith(
        roomId,
        'm.room.message',
        expect.objectContaining({ body: message, msgtype: 'm.text' }),
        expect.anything(),
      );

      sub.unsubscribe();
    });
  });

  describe('matrixMessageReceivedEpic', () => {
    let state$: BehaviorSubject<RaidenState>;

    beforeEach(() => {
      state$ = new BehaviorSubject<RaidenState>(
        [
          matrixSetup({
            server: matrixServer,
            setup: { userId, deviceId, accessToken, displayName },
          }),
        ].reduce(raidenReducer, state),
      );
      depsMock.matrix$ = new AsyncSubject();
      depsMock.matrix$.next(matrix);
      depsMock.matrix$.complete();
    });

    test('receive: success on late presence and late room', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        message = 'test message',
        action$ = new Subject<RaidenAction>();

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // actions sees presence update for partner only later
      action$.next(
        matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
      );
      // state includes room for partner only later
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });

    test('receive: decode signed message', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        signed = await signMessage(partnerSigner, processed),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        );
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          message: {
            type: MessageType.PROCESSED,
            message_identifier: expect.any(BigNumber),
            signature: expect.any(String),
          },
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });

    test("receive: messages from wrong sender aren't decoded", async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        // signed by ourselves
        signed = await signMessage(depsMock.signer, processed),
        message = encodeJsonMessage(signed),
        action$ = of(
          matrixPresenceUpdate({ userId: partnerUserId, available: true }, { address: partner }),
        );
      state$.next(
        [matrixRoom({ roomId }, { address: partner })].reduce(raidenReducer, state$.value),
      );

      const promise = matrixMessageReceivedEpic(action$, state$, depsMock)
        .pipe(first())
        .toPromise();

      matrix.emit(
        'Room.timeline',
        {
          getType: () => 'm.room.message',
          getSender: () => partnerUserId,
          event: {
            content: { msgtype: 'm.text', body: message },
            origin_server_ts: 123,
          },
        },
        { roomId, getCanonicalAlias: jest.fn(), getAliases: jest.fn(() => []) },
      );

      // then it resolves
      await expect(promise).resolves.toMatchObject({
        type: getType(messageReceived),
        payload: {
          text: message,
          message: undefined,
          ts: expect.any(Number),
          userId: partnerUserId,
          roomId,
        },
        meta: { address: partner },
      });
    });
  });

  describe('matrixMessageReceivedUpdateRoomEpic', () => {
    test('messageReceived on second room emits matrixRoom', async () => {
      expect.assertions(1);

      const roomId = partnerRoomId,
        action$ = of(
          messageReceived(
            { text: 'test message', ts: 123, userId: partnerUserId, roomId },
            { address: partner },
          ),
        ),
        state$ = of(
          [
            matrixRoom({ roomId }, { address: partner }),
            // newRoom becomes first 'choice', roomId goes second
            matrixRoom({ roomId: `!newRoomId_for_partner:${matrixServer}` }, { address: partner }),
          ].reduce(raidenReducer, state),
        );

      await expect(
        matrixMessageReceivedUpdateRoomEpic(action$, state$).toPromise(),
      ).resolves.toEqual(matrixRoom({ roomId }, { address: partner }));
    });
  });

  test('deliveredEpic', async () => {
    expect.assertions(5);

    const roomId = partnerRoomId,
      message = await signMessage(partnerSigner, processed),
      text = encodeJsonMessage(message),
      action = messageReceived(
        { text, message, ts: 123, userId: partnerUserId, roomId },
        { address: partner },
      ),
      other: Delivered = {
        type: MessageType.DELIVERED,
        delivered_message_identifier: makeMessageId(),
      },
      otherSigned = await signMessage(partnerSigner, other),
      otherText = encodeJsonMessage(otherSigned),
      otherAction = messageReceived(
        { text: otherText, message: otherSigned, ts: 456, userId: partnerUserId, roomId },
        { address: partner },
      ),
      // twice messageReceived
      action$ = of(action, action, otherAction);

    const signerSpy = jest.spyOn(depsMock.signer, 'signMessage');

    const output = await deliveredEpic(action$, EMPTY, depsMock)
      .pipe(toArray())
      .toPromise();

    expect(output).toHaveLength(2);
    expect(output[0]).toEqual(
      messageSend(
        {
          message: {
            type: MessageType.DELIVERED,
            delivered_message_identifier: message.message_identifier,
            signature: expect.any(String),
          },
        },
        action.meta,
      ),
    );
    expect(output[1].payload.message).toBe(output[0].payload.message);

    // second signature should have been cached
    expect(signerSpy).toHaveBeenCalledTimes(1);
    signerSpy.mockRestore();

    // if you pass something different than the accepted messages, no Delivered is replied
    await expect(
      deliveredEpic(of(otherAction), EMPTY, depsMock).toPromise(),
    ).resolves.toBeUndefined();
  });

  test('matrixMessageGlobalSendEpic', async () => {
    expect.assertions(5);

    const message = await signMessage(partnerSigner, processed),
      text = encodeJsonMessage(message),
      state$ = of(
        [
          matrixSetup({
            server: matrixServer,
            setup: { userId, deviceId, accessToken, displayName },
          }),
        ].reduce(raidenReducer, state),
      );

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: 'unknown_global_room' })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(matrix.sendEvent).toHaveBeenCalledTimes(0);

    await expect(
      matrixMessageGlobalSendEpic(
        of(messageGlobalSend({ message }, { roomName: depsMock.config$.value.discoveryRoom! })),
        state$,
        depsMock,
      ).toPromise(),
    ).resolves.toBeUndefined();

    expect(matrix.sendEvent).toHaveBeenCalledTimes(1);
    expect(matrix.sendEvent).toHaveBeenCalledWith(
      expect.any(String),
      'm.room.message',
      expect.objectContaining({ body: text, msgtype: 'm.text' }),
      expect.anything(),
    );
  });
});
