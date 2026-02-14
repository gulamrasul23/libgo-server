const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_KEY);

const port = process.env.PORT || 3000;

const admin = require("firebase-admin");

const serviceAccount = require("./lib-go-firebase-adminsdk.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//Middle ware

app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized Access' });
  }
  try {
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.decoded_email = decoded.email;
    next();
  }
  catch (err) {

    return res.status(401).send({ message: 'Unauthorized Access' });
  }

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vxw38xu.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const libGoDb = client.db("lib_go_db");
    const userCall = libGoDb.collection("users");
    const bookCall = libGoDb.collection("books");
    const orderCall = libGoDb.collection("orders");
    const orderInvoiceCall = libGoDb.collection("invoices");
    const wishlistCall = libGoDb.collection("wishlists");

    //Middleware for admin ,ti must be write after verifyFBToken ----

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCall.findOne(query);
      if (!user || user.role !== 'admin') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }

    //Middleware for librarian, it must be write after verifyFBToken---

    const verifyLibrarian = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await userCall.findOne(query);
      if (!user || user.role !== 'librarian') {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }




    //User api------------------

    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const existing = await userCall.findOne({
        email: newUser.email,
      });

      if (existing) {
        return res.send({ message: "User already exists" });
      }

      const result = await userCall.insertOne(newUser);
      res.send(result);
    });

    app.get("/users", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
        query.email = email;

        const result = await userCall.findOne(query);
        res.send(result);
      } else {
        const cursor = userCall.find(query).sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      }
    });

    app.get('/users/:email/role', verifyFBToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email };
      const user = await userCall.findOne(query);
      res.send({ role: user?.role || "customer" })
    })

    app.patch('/users/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updateRole = req.body;
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: updateRole,
      }
      const result = await userCall.updateOne(query, update);
      res.send(result);
    })

    app.patch("/users", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const updateProfile = req.body;
      const query = {};
      if (email) {
        query.email = email;
      }
      const update = {
        $set: {
          displayName: updateProfile.displayName,
          photoURL: updateProfile.photoURL,
        },
      };
      const result = await userCall.updateOne(query, update);
      res.send(result);
    });

    //Book api------------------

    app.get('/books/manage-books', verifyFBToken, verifyAdmin, async (req, res) => {
      const query = {};
      const cursor = bookCall.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    })

    app.patch('/books/manage-books/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const updateRole = req.body;
      const query = { _id: new ObjectId(id) }
      const update = {
        $set: updateRole,
      }
      const result = await bookCall.updateOne(query, update);
      res.send(result);
    })
    app.patch('/books/manage-books', verifyFBToken, verifyLibrarian, async (req, res) => {
      const email = req.query.email;
      const updateLibrarianUrl = req.body;
      const query = { librarianEmail: email }
      const update = {
        $set: {
          librarianPhotoUrl: updateLibrarianUrl.librarianPhotoUrl,
        },
      }
      const result = await bookCall.updateMany(query, update);
      res.send(result);
    })

    app.delete('/books/manage-books/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCall.deleteOne(query);
      res.send(result);
    })

    app.get("/books", async (req, res) => {
      const { limit, searchText } = req.query;
      const query = { status: 'Published' };

      if (searchText) {
        query.bookTitle = { $regex: searchText, $options: "i" };
      }
      let cursor = bookCall.find(query).sort({ createdAt: -1 });
      if (limit) {
        cursor = cursor.limit(Number(limit));
      }
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/books/book-details/:id", verifyFBToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCall.findOne(query);
      res.send(result);
    });

    app.post("/books/add-book", verifyFBToken, verifyLibrarian, async (req, res) => {
      const newBook = req.body;
      newBook.librarianEmail = req.decoded_email;
      const result = await bookCall.insertOne(newBook);
      res.send(result);
    });

    app.get('/books/my-book', verifyFBToken, verifyLibrarian, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.librarianEmail = email;
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: 'forbidden access' })
        }
      }
      const cursor = bookCall.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get("/books/update-book/:id", verifyFBToken, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCall.findOne(query);
      res.send(result);
    });

    app.patch('/books/update-book/:id', verifyFBToken, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const updateBook = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateBook,
      }
      const result = await bookCall.updateOne(query, update);
      res.send(result);
    })



    // Order api----------------

    app.post("/orders", verifyFBToken, async (req, res) => {
      const newOrder = req.body;
      newOrder.createdAt = new Date();
      const result = await orderCall.insertOne(newOrder);
      res.send(result);
    });

    app.delete('/orders/book/:id', verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { bookId: id };
      console.log("ID:", id);
      console.log("Query:", query);
      const result = await orderCall.deleteMany(query);
      res.send(result);
    })

    app.get("/orders", verifyFBToken, verifyLibrarian, async (req, res) => {
      const { email, payment } = req.query;
      const query = {};
      if (email) {
        query.librarianEmail = email;
      }
      if (payment) {
        query.payment = payment;
      }
      const cursor = orderCall.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/orders/my-order", verifyFBToken, async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      const cursor = orderCall.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.patch("/orders/:id", verifyFBToken, verifyLibrarian, async (req, res) => {
      const id = req.params.id;
      const updateStatus = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: updateStatus,
      };
      const options = {};
      const result = await orderCall.updateOne(query, update, options);
      res.send(result);
    });



    // Payment api --------------

    app.post("/create-checkout-session", verifyFBToken, async (req, res) => {
      const paymentInfo = req.body;
      const amount = parseInt(paymentInfo.price) * 100;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: amount,
              product_data: {
                name: `Please pay for book: ${paymentInfo.bookTitle}`,
              },
            },

            quantity: 1,
          },
        ],
        customer_email: paymentInfo.customerEmail,
        mode: "payment",
        metadata: {
          paymentId: paymentInfo.paymentId,
          bookTitle: paymentInfo.bookTitle,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/my-order?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/my-order`,
      });
      res.send({ url: session.url });
    });

    // Invoice api ---------------

    app.patch("/dashboard/my-order", verifyFBToken, async (req, res) => {
      const session = await stripe.checkout.sessions.retrieve(
        req.query.session_id,
      );
      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const existingInvoice = await orderInvoiceCall.findOne(query);
      if (existingInvoice) {
        return res.send({ message: "Already exist", transactionId });
      }
      if (session.payment_status === "paid") {
        const id = session.metadata.paymentId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            payment: "paid",

          },
        };
        const result = await orderCall.updateOne(query, update);
        const payment = {
          amount: session.amount_total / 100,
          customerEmail: session.customer_email,
          paymentId: session.metadata.paymentId,
          bookTitle: session.metadata.bookTitle,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
        };
        if (session.payment_status === "paid") {
          const paymentInvoices = await orderInvoiceCall.insertOne(payment);
          return res.send({
            success: true,
            modifyInvoice: result,
            paymentInfo: paymentInvoices,
            transactionId: session.payment_intent,
          });
        }
      }

      res.send({ success: false });
    });

    app.get("/invoices", verifyFBToken, async (req, res) => {
      const { email, paymentStatus } = req.query;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      if (paymentStatus) {
        query.paymentStatus = paymentStatus;
      }
      const result = await orderInvoiceCall.find(query).sort({ paidAt: -1 }).toArray();
      res.send(result);
    });

    // Wishlist api -----------------------

    app.post('/wishlists', verifyFBToken, async (req, res) => {

      const { customerEmail, wishlistId } = req.body;

      const existingItem = await wishlistCall.findOne({
        customerEmail: customerEmail,
        wishlistId: wishlistId,
      });

      if (existingItem) {
        return res.status(400).send({
          message: "Already added to wishlist",
        });
      }
      const result = await wishlistCall.insertOne(req.body);

      res.send(result)

    })

    app.get('/wishlists/my-wishlist', verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const query = { customerEmail: email };
      const cursor = wishlistCall.find(query).sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    })

    app.delete('/wishlists/my-wishlist', verifyFBToken, async (req, res) => {
      const email = req.decoded_email;
      const { wishlistId } = req.query;
      const query = { customerEmail: email, wishlistId: wishlistId };
      const result = await wishlistCall.deleteOne(query);
      res.send(result);
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("LibGo server is running");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
