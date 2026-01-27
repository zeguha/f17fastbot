# Lava.top API Client

A TypeScript client for interacting with the Lava.top API. This client provides a type-safe way to create and manage payments and subscriptions.

## Features

- Type-safe API interactions
- Modern async/await syntax
- Comprehensive error handling
- Easy to use interface with clear parameter structure
- Support for multiple currencies (USD, EUR, RUB)
- Support for various payment methods (BANK131, UNLIMINT, PAYPAL, STRIPE)
- Webhook signature verification
- Subscription management
- Automatic payment page redirect

## Installation

```bash
npm install @lavaclient/lava.top
```

## Configuration
The client can be used in two different ways: 
1. without config file
2. with config json file
   
### Without config file
```typescript
import { LavaClient } from '@lavaclient/lava.top';

const client = new LavaClient({
  apiKey: 'your-api-key',
  webhookSecretKey: 'your-webhook-secret-key', // Optional, for webhook verification
});
```

### Config.json file example 
```
{
  "apiKey": "your-api-key",
  "webhookSecretKey": "your-webhook-secret-key",
  "baseURL": "https://gate.lava.top",
  "timeout": 30000,
  "logging": {
    "level": "DEBUG",
    "format": "json"
  }
} 
```

## Quick Start

Here's a quick example of how to set up Express server with Lava.top API integration:

1. First, install the required dependencies:
```bash
npm install express cors dotenv lava-top-sdk
```

1. Create a server file (e.g., `server.ts`):
```typescript
import express, { Request, Response } from 'express';
import cors from 'cors';
import { 
  LavaClient,  FeedItemType,  FeedVisibility,  ProductType,  WebhookHandler,  WebhookServer,  LogLevel, PaymentSuccessData, PaymentFailedData, SubscriptionCancellationData, SubscriptionRecurringPaymentSuccessData, SubscriptionRecurringPaymentFailedData, PaymentMethod, Language
} from 'lava-top-sdk';
import config from '../config.json'; //JSON file with configuration
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT) || 3002;

// Middleware
app.use(cors()); // NOTE: this is just quick example - please configure secure for PROD mode.
app.use(express.json());

const PORT = Number(process.env.PORT) || 3001;

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 
```
2. Initialize LavaClient and start server
```ts
// Initialize LavaClient
const client = new LavaClient({
  ...config,
  logging: {
    level: LogLevel.DEBUG,
    format: "json" as const
  }
});
```

3. Get Products example
```ts
const productsResponse = await client.getProducts(undefined, FeedItemType.PRODUCT, undefined, FeedVisibility.ALL, false);
console.log('Products:', productsResponse.items);
```
4. Create Payment example
```ts
const result = await client.createOneTimePayment(email, orderId, currency);
// result will contain paymentUrl, it will be requred to redirect user's browser to paymentUrl - to continue with payment processing 
// orderId - is IF of the specific offer from the list of products (which has been porvided by getProducts)
```
5. Handling Webhooks
```ts
const WEBHOOK_PORT = Number(process.env.WEBHOOK_PORT) || 3002;

// Create webhook handler with callback functions
const webhookHandler = new WebhookHandler({
  secretKey: config.webhookSecretKey,
  // Payment success handler
  onPaymentSuccess: async (data: PaymentSuccessData) => {
    // console.log('--> Payment successful:', data);
  }
  // ...
});

// Start webhook server
new WebhookServer(webhookHandler, WEBHOOK_PORT);
```

## API Methods

### One-time Payments

#### Create One-time Payment
```typescript
const payment = await client.createOneTimePayment({
  email: 'customer@example.com',
  offerId: 'your-offer-id',
  currency: Currency.USD, // or Currency.EUR
  paymentMethod: PaymentMethod.BANK131, // optional
  buyerLanguage: Language.RU, // optional
  clientUtm: {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'test_campaign',
    utm_term: 'keyword',
    utm_content: 'banner'
  } // optional
});

// Redirect to payment page if paymentUrl is provided
if (payment.paymentUrl) {
  window.location.href = payment.paymentUrl;
}
```

### Subscriptions

#### Create Subscription
```typescript
const subscription = await client.createSubscription({
  email: 'customer@example.com',
  offerId: 'your-subscription-offer-id',
  currency: Currency.EUR,
  periodicity: Periodicity.MONTHLY,
  paymentMethod: PaymentMethod.STRIPE, // optional
  buyerLanguage: Language.EN, // optional
  clientUtm: {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'test_campaign',
    utm_term: 'keyword',
    utm_content: 'banner'
  } // optional
});

// Redirect to payment page if paymentUrl is provided
if (subscription.paymentUrl) {
  window.location.href = subscription.paymentUrl;
}
```

### Payment Management

#### Get Payment Status
```typescript
const status = await client.getInvoices('invoice-id');
```

### Products

#### Get Products List
```typescript
const products = await client.getProducts({
  beforeCreatedAt: '2024-01-01T00:00:00Z', // optional
  contentCategories: FeedItemType.PRODUCT, // optional
  productTypes: ProductType.COURSE, // optional
  feedVisibility: FeedVisibility.ALL, // optional
  showAllSubscriptionPeriods: true // optional
});
```

### Webhook Handling
The WebhookHandler class handles webhooks from Lava Public API.
For handling webhooks, it will be required to:
1. Add WebHook configuration in Integration tab in your Lava.Top profile.
   Polulate URL field with `https://${your_domain}:${webhook_port}/webhook`
   As an authentication, you should select "API key" for your webhook service, the value will be use in `secretKey` field in WebhookHandler constructor.
2. Initialize WebHookHandler class
```ts
const webhookHandler = new WebhookHandler({
  secretKey: config.webhookSecretKey,
  onPaymentSuccess: async (data: PaymentSuccessData) => {
      console.log('--> Payment successful:', data);
      // you can add your own handler here
  },
  onPaymentFailed: async (data: PaymentFailedData) => {
    console.log('--> Payment failed:', data);
    // you can add your own handler here
  },
  onSubscriptionCancelled: async (data: SubscriptionCancellationData) => {
    console.log('--> Subscription cancelled:', data);
    // you can add your own handler here
  },
  onSubscriptionRecurringPaymentSuccess: async (data: SubscriptionRecurringPaymentSuccessData) => {
    console.log('--> Recurring payment successful:', data);
    // you can add your own handler here
  },
  onSubscriptionRecurringPaymentFailed: async (data: SubscriptionRecurringPaymentFailedData) => {
    console.log('--> Recurring payment failed:', data);
    // you can add your own handler here
  }
});
```
1. Start webhook server, the server will be listening on port: WEBHOOK_PORT and URI: `/webhook`
```ts
new WebhookServer(
  webhookHandler,
  WEBHOOK_PORT
);
```

## Error Handling

The client throws errors with detailed information when API calls fail:

```typescript
try {
  await client.createOneTimePayment({
    email: 'customer@example.com',
    offerId: 'your-offer-id',
    currency: Currency.USD // or Currency.EUR
  });
} catch (error) {
  // Handle error
}
```

## Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Run tests: `npm test`

## License

MIT