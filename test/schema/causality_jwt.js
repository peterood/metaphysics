import sinon from 'sinon';
import { graphql } from 'graphql';
import schema from '../../schema';
import jwt from 'jwt-simple';
import { omit } from 'lodash';

const { HMAC_SECRET } = process.env;

describe('CausalityJWT', () => {
  const CausalityJWT = schema.__get__('CausalityJWT');

  let gravity;

  beforeEach(() => {
    gravity = sinon.stub();
    gravity.with = sinon.stub().returns(gravity);
    gravity
      .onCall(0)
      .returns(Promise.resolve({ _id: 'foo', name: 'Foo sale', id: 'slug' }))
      .onCall(1)
      .returns(Promise.resolve({
        _id: 'craig',
        paddle_number: '123',
        type: 'User',
      }))
      .onCall(2)
      .returns(Promise.resolve([{ id: 'bidder1', sale: { _id: 'foo', id: 'slug' } }]));
    CausalityJWT.__Rewire__('gravity', gravity);
  });

  afterEach(() => {
    CausalityJWT.__ResetDependency__('gravity');
  });

  it('encodes a bidder JWT for logged in registered users', () => {
    const query = `{
      causality_jwt(role: PARTICIPANT, sale_id: "foo")
    }`;
    return graphql(schema, query, { accessToken: 'foo' })
      .then((data) => {
        omit(jwt.decode(data.data.causality_jwt, HMAC_SECRET), 'iat')
          .should.eql({
            aud: 'auctions',
            role: 'bidder',
            userId: 'craig',
            saleId: 'foo',
            bidderId: 'bidder1',
          });
      });
  });

  it('works with a sale slug', () => {
    const query = `{
      causality_jwt(role: PARTICIPANT, sale_id: "slug")
    }`;
    return graphql(schema, query, { accessToken: 'foo' })
      .then((data) => {
        omit(jwt.decode(data.data.causality_jwt, HMAC_SECRET), 'iat')
          .should.eql({
            aud: 'auctions',
            role: 'bidder',
            userId: 'craig',
            saleId: 'foo',
            bidderId: 'bidder1',
          });
      });
  });

  it('allows an anonymous user to be an observer', () => {
    const query = `{
      causality_jwt(role: PARTICIPANT, sale_id: "slug")
    }`;
    gravity
      .onCall(0)
      .returns(Promise.resolve({ _id: 'foo' }));
    return graphql(schema, query, { accessToken: null })
      .then((data) => {
        omit(jwt.decode(data.data.causality_jwt, HMAC_SECRET), 'iat')
          .should.eql({
            aud: 'auctions',
            role: 'observer',
            userId: null,
            saleId: 'foo',
            bidderId: null,
          });
      });
  });

  it('falls back to observer if not registered to the sale', () => {
    const query = `{
      causality_jwt(role: PARTICIPANT, sale_id: "bar")
    }`;
    gravity
      .onCall(2)
      .returns(Promise.resolve([]));
    return graphql(schema, query, { accessToken: 'foo' })
      .then((data) => {
        omit(jwt.decode(data.data.causality_jwt, HMAC_SECRET), 'iat')
          .should.eql({
            aud: 'auctions',
            role: 'observer',
            userId: 'craig',
            saleId: 'foo',
            bidderId: null,
          });
      });
  });

  it('denies a non-admin operator', () => {
    const query = `{
      causality_jwt(role: OPERATOR, sale_id: "foo")
    }`;
    return graphql(schema, query, { accessToken: 'foo' })
      .then((data) => {
        data.errors[0].message.should.containEql('Unauthorized');
      });
  });
});
