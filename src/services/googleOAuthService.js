'use strict';

const { OAuth2Client } = require('google-auth-library');

class GoogleOAuthConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleOAuthConfigurationError';
    this.code = 'GOOGLE_OAUTH_NOT_CONFIGURED';
  }
}

const getGoogleOAuthConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL?.trim();

  if (!clientId || !clientSecret || !callbackUrl) {
    throw new GoogleOAuthConfigurationError(
      'Google authentication is not configured on the server.'
    );
  }

  return { clientId, clientSecret, callbackUrl };
};

const createGoogleOAuthClient = () => {
  const { clientId, clientSecret, callbackUrl } = getGoogleOAuthConfig();
  return new OAuth2Client(clientId, clientSecret, callbackUrl);
};

const createGoogleAuthorizationUrl = (state) => {
  const client = createGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: 'online',
    include_granted_scopes: true,
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
};

const exchangeGoogleAuthorizationCode = async (code) => {
  const client = createGoogleOAuthClient();
  const { clientId } = getGoogleOAuthConfig();
  const { tokens } = await client.getToken(code);

  if (!tokens.id_token) {
    throw new Error('Google did not return an ID token.');
  }

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: clientId,
  });

  return ticket.getPayload();
};

module.exports = {
  GoogleOAuthConfigurationError,
  createGoogleAuthorizationUrl,
  exchangeGoogleAuthorizationCode,
};
