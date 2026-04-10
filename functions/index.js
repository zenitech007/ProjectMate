const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const CREDITS_PER_PURCHASE = 2;

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  // Verify signature
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;

  if (event.event === 'charge.success') {
    const { reference, customer, amount } = event.data;
    const email = customer.email;

    try {
      // Find user by email
      const userSnapshot = await admin.auth().getUserByEmail(email);
      const uid = userSnapshot.uid;

      const userRef = admin.firestore().collection('users').doc(uid);

      await admin.firestore().runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) {
          throw new Error('User not found');
        }

        // Grant credits and set premium status
        transaction.update(userRef, {
          credits: admin.firestore.FieldValue.increment(CREDITS_PER_PURCHASE),
          isPremium: true
        });

        // Log payment history
        const paymentRef = userRef.collection('paymentHistory').doc(reference);
        transaction.set(paymentRef, {
          amount: amount / 100,
          currency: 'NGN',
          credits_added: CREDITS_PER_PURCHASE,
          reference: reference,
          status: 'success',
          date: admin.firestore.FieldValue.serverTimestamp()
        });
      });

      console.log(`Successfully processed payment for ${email}. Ref: ${reference}`);
      return res.status(200).send('Webhook processed');
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).send('Internal Server Error');
    }
  }

  res.status(200).send('Event ignored');
});
