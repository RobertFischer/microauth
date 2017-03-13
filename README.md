# microauth
A third party authentication microservice running on Node.js

## Version Warning
This code was written using `Node 7.7.2`.  Use earlier Node versions at your own risk.

# Overview

Here are the distinct entities within this document:

1. `Microauth` -- This is the authentication server itself.
2. `Organization` -- This is a systems which is requesting authentication.
3. `Browser` -- This is a user who goes through the authentication flow.
4. `Provider` -- A system which can provide authentication to a browser.

## Microauth (the server itself)

Microauth is run with its own Redis server running in the background. The server will
read the `REDIS_URL` environment variable for
[the Redis connection URL](https://www.iana.org/assignments/uri-schemes/prov/redis) and
use that to connect. The server will attach to the port specified in the `PORT`
environment variable, or `3414` by default. Once it is running, it provides a REST API
that clients connect to.

## Organization (those requesting authentication)

An organization is uniquely defined by the URL prefix which prefaces all the provided URLs.
There are two organization URLs which are necessary to provide: `verify`, which where Microauth
will call in order to verify the data; `result`, where browsers' authentication data is
posted to when the browser successfully authenticates. In addition, the URL where the browser
is sent on success or failure is also prepended with these values.

Authentication is done through public-private key cryptography: the ability to encrypt
or decrypt with the organization's private key is considered sufficient evidence that the
caller is the organization.

## Browser (those performing the authentication flow)

A browser is identified by browser key, which is provided by the organization when they generate
the link to enter the authentication flow. Microauth does not provide any way to access data
about browsers aside from having them enter an authentication flow of a provider: on success,
the results of the authentication flow will be sent to the organization's result URL. Microauth
does not retain that information.

## Provider (that which provides an authentication flow)

Providers are the third-party systems -- like Google or Twitter -- that provide an authentication
flow for the given user. The organization is responsible for providing all the necessary
credentials to drive that flow. The organization will also have to set the callback URL for the
oAuth flow appropriately: more details about that below.

# Organization Sign-Up

For an organization to sign-up, they first need to gather together the following pieces of
information:

1. The URL prefix, which will be prepended to all the paths that are provided.
2. The path under the URL prefix which will receive the verification callback.
3. The path under the URL prefix which will receive the authentication callbacks.
4. The path under the URL prefix where the browser will be referred on success.
5. The path under the URL prefix where the browser will be referred on failure.
6. The public and private keys for RSA in PEM file format.
7. The short name (only alphanumerics, dashes, and underscores) that will identify the organization.
8. The necessary configuration information from the providers (usually a client secret and client id).

## Create the Organization

The organization will hit the `POST /organizations` endpoint with a JSON containing the following data:

```
{
  "urlName": "foobar",
  "urlPrefix": "https://path.to/your/app",
  "publicKey": organization's RSA public key (>= 2048 bit length) in PEM file format,
  "serverUrls": {
    "verify": "/auth/verify",
    "result": "/auth/result"
  }
  "browserUrls": {
    "success": "/auth/success",
    "failure": "/auth/failure"
  }
}
```

Before the request returns, Microauth will perform a `POST` back to the URL made up by concatenating `urlPrefix` and `serverUrls.verify`.
That request will be semantically identical to the request that the organization just sent, with the following addition:

```
{
  ...
  "request": {
    "method": "POST",
    "endpoint": "/organizations"
  },
  "challenge": {
    "encrypted": Base64-encoded, organization-public-key-encrypted nonce,
    "sha-256": Base64-encoded, sha-256 hash of nonce
  }
  ...
}
```

The organization's server is expected to verify that the data is accurate, and then respond with the Base64-encoded nonce (decrypted from
`encrypted`). The return type can either be `text/plain` (and then just the nonce itself in the body), or it can be `application/json`
(and then the body is the nonce as a JSON string, as a JSON array with a single element that is the nonce as a JSON string, or as an
object with a single entry whose value is the nonce as a JSON string).

If the response is accurate, then the server will respond to the original request with a `201 CREATED` response. If the response is not
accurate, or there is another issue, then the server will respond to the original request with a `400 BAD REQUEST` response.

## Retrieving the Organization

The organization's data is public under `GET /organizations/{urlName}`. That will include all the information that was provided in the
original POST request that created the organization, along with an object keyed off of `providers`. The value of the `providers` entry
is an object keyed off of every available provider, with the value being a boolean value about whether or not it is configured.

## Updating the Organization

The organization's data may be updated by hitting `PATCH /organizations/{urlName}`. The JSON object passed in will be merged with the
JSON object that would be retrieved at `GET /organizations/{urlName}`, except for the `providers` entry.

Before the request returns, Microauth will perform a `POST` back to the URL made up by concatenating `urlPrefix` and `serverUrls.verify`.
That request will be the updated organization JSON object, with the following addition:

```
{
  ...
  "request": {
    "method": "PATCH",
    "endpoint": organization path
  },
  "challenge": {
    "encrypted": Base64-encoded, organization-public-key-encrypted nonce,
    "sha-256": Base64-encoded, sha-256 hash of nonce
  }
  ...
}
```

The organization's server is expected to verify that the data is accurate, and then respond with the Base64-encoded nonce (decrypted from
`encrypted`). The return type can either be `text/plain` (and then just the nonce itself in the body), or it can be `application/json`
(and then the body is the nonce as a JSON string, as a JSON array with a single element that is the nonce as a JSON string, or as an
object with a single entry whose value is the nonce as a JSON string).

## Retrieving Required Fields for a Provider

The fields required for an organization to use a provider can be retrieved at `GET /organizations/{urlName}/providers/{providerName}`.
This will also provide the callback URL, or any other information which needs to come out of Microauth for the organization to use the
provider.

If a field is required but available, the field name will be a key with `null` as its value.

If a field is required and already set to a value shorter than 255 characters, the field name will be a key, and the value will be an object with this shape:

```
{
  ...
  field name: {
    "encrypted": Base64-encoded, organization-public-key-encrypted field value,
    "sha-256": Base64-encoded, sha-256 hash of field value
  }
  ...
}
```

If a field is required and already set to a value greater than 255 8-bit characters, the field name will be a key, and the value will be an object with this shape:

```
{
  ...
  field name: {
    "encrypted": Base64-encoded, AES-key-encrypted field value,
    "sha-256": Base64-encoded, sha-256 hash of field value
    "aes-256": {
      "encrypted": Base64-encoded, organization-public-key-encrypted AES-256-ECB key,
      "sha-256": Base64-encoded, sha-256 hash of AES-256-ECB key
    }
  }
  ...
}
```

## Providing the Fields for a Provider

Fields for a provider may be provided by using `PATCH /organizations/{urlName}/providers/{providerName}`. The provided JSON object is merged
with the existing JSON object at `GET /organizations/{urlName}/providers/{providerName}`. You may provide `null` as a value to delete
a particular field.

Fields may be encrypted. To do so, retrieve Microauth's public key from `GET /microauth`. Then, instead of sending the field value as
a JSON string, instead send it as a JSON object of this form:

```
{
  ...
  field name: {
    "encrypted": Base64-encoded, microauth-public-key-encrypted field value (<= 255 8-bit chars),
    "sha-256": Base64-encoded, sha-256 hash of field value
  }
  ...
}
```

If you need more than 255 8-bit chararacters for the field value, you can send the value in this form:

```
{
  ...
  field name: {
    "encrypted": Base64-encoded, AES-key-encrypted field value,
    "sha-256": Base64-encoded, sha-256 hash of field value
    "aes-256": {
      "encrypted": Base64-encoded, microauth-public-key-encrypted AES-256-ECB key,
      "sha-256": Base64-encoded, sha-256 hash of AES-256-ECB key
    }
  }
  ...
}
```

Before the request returns, Microauth will perform a `POST` back to the URL made up by concatenating `urlPrefix` and `serverUrls.verify`.
That request will be semantically identical to the request that the organization just sent, with the following addition:

```
{
  ...
  "request": {
    "method": "PATCH",
    "endpoint": path of the endpoint that was hit
  }
  "challenge": {
    "encrypted": Base64-encoded, organization-public-key-encrypted nonce,
    "sha-256": Base64-encoded, sha-256 hash of nonce
  }
  ...
}
```

The organization's server is expected to verify that the data is accurate, and then respond with the Base64-encoded nonce (decrypted from
`encrypted`). The return type can either be `text/plain` (and then just the nonce itself in the body), or it can be `application/json`
(and then the body is the nonce as a JSON string, as a JSON array with a single element that is the nonce as a JSON string, or as an
object with a single entry whose value is the nonce as a JSON string).

If the response is accurate, then the server will respond to the original request with a `200 OK` response. If the response is not
accurate, or there is another issue, then the server will respond to the original request with a `400 BAD REQUEST` response.

