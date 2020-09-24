'use strict';

module.exports = function ({
  utils,
  Paho,
  _Router,
  Logger,
}) {
  describe('static properties', () => {
    describe('pahoErrorCodes', () => {
      it('should contain the Paho error codes needed for privately handling certain errors', () => {
        const Router = _Router.default(Paho.Paho);

        expect(Router.pahoErrorCodes).toBeObject();
        expect(Router.pahoErrorCodes).toContainAllKeys([
          'NOT_CONNECTED',
          'ALREADY_CONNECTED',
        ]);
        expect(Router.pahoErrorCodes.NOT_CONNECTED).toEqual('AMQJS0011E');
        expect(Router.pahoErrorCodes.ALREADY_CONNECTED).toEqual('AMQJS0011E');
      });
    });

    describe('events', () => {
      it('should contain the event names needed to communicate with the parent window', () => {
        const Router = _Router.default(Paho.Paho);

        expect(Router.events).toBeObject();
        expect(Router.events).toContainAllKeys([
          'CREATE_SUCCESS',
          'CREATE_FAILURE',
          'DATA_RECEIVED',
          'PUBLISH_SUCCESS',
          'PUBLISH_FAILURE',
          'CONNECT_SUCCESS',
          'CONNECT_FAILURE',
          'CONNECTION_LOST',
          'DISCONNECT_SUCCESS',
          'DISCONNECT_FAILURE',
          'SUBSCRIBE_FAILURE',
          'UNSUBSCRIBE_SUCCESS',
          'UNSUBSCRIBE_FAILURE',
          'WINDOW_MESSAGE_FAIL',
        ]);
        expect(Router.events.CREATE_SUCCESS).toEqual('clsp_router_create_success');
        expect(Router.events.CREATE_FAILURE).toEqual('clsp_router_create_failure');
        expect(Router.events.DATA_RECEIVED).toEqual('clsp_router_clsp_data');
        expect(Router.events.PUBLISH_SUCCESS).toEqual('clsp_router_publish_success');
        expect(Router.events.PUBLISH_FAILURE).toEqual('clsp_router_publish_failure');
        expect(Router.events.CONNECT_SUCCESS).toEqual('clsp_router_connect_success');
        expect(Router.events.CONNECT_FAILURE).toEqual('clsp_router_connect_failure');
        expect(Router.events.CONNECTION_LOST).toEqual('clsp_router_connection_lost');
        expect(Router.events.DISCONNECT_SUCCESS).toEqual('clsp_router_disconnect_success');
        expect(Router.events.DISCONNECT_FAILURE).toEqual('clsp_router_disconnect_failure');
        expect(Router.events.SUBSCRIBE_FAILURE).toEqual('clsp_router_subscribe_failure');
        expect(Router.events.UNSUBSCRIBE_SUCCESS).toEqual('clsp_router_unsubscribe_success');
        expect(Router.events.UNSUBSCRIBE_FAILURE).toEqual('clsp_router_unsubscribe_failure');
        expect(Router.events.WINDOW_MESSAGE_FAIL).toEqual('clsp_router_window_message_fail');
      });
    });

    describe('commands', () => {
      it('should contain the command names needed for the parent window to send commands to the Router', () => {
        const Router = _Router.default(Paho.Paho);

        expect(Router.commands).toBeObject();
        expect(Router.commands).toContainAllKeys([
          'CONNECT',
          'DISCONNECT',
          'PUBLISH',
          'SUBSCRIBE',
          'UNSUBSCRIBE',
          'SEND',
        ]);
        expect(Router.commands.CONNECT).toEqual('connect');
        expect(Router.commands.DISCONNECT).toEqual('disconnect');
        expect(Router.commands.PUBLISH).toEqual('publish');
        expect(Router.commands.SUBSCRIBE).toEqual('subscribe');
        expect(Router.commands.UNSUBSCRIBE).toEqual('unsubscribe');
        expect(Router.commands.SEND).toEqual('send');
      });
    });
  });
};
