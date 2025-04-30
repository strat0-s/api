const express = require("express");
const { ethers } = require("ethers");
const forge = require("node-forge");
const cors = require("cors");
require("dotenv").config();
const { abi: contractABI } = require("./abi/KeyManagerV3.json");

const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_API_KEY);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, signer);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const setupSwagger = require("./swagger");
setupSwagger(app);

// Utility: JSON → DER bytes
function rsaJsonToDerBytes(jsonKey) {
    const n = new forge.jsbn.BigInteger(jsonKey.n.toString());
    const e = new forge.jsbn.BigInteger(jsonKey.e.toString());
    const publicKey = forge.pki.setRsaPublicKey(n, e);
    const asn1 = forge.pki.publicKeyToAsn1(publicKey);
    const der = forge.asn1.toDer(asn1).getBytes();
    return Buffer.from(der, 'binary');
}

// Utility: DER bytes → JSON
function derBytesToRsaJson(buffer) {
    const der = forge.util.createBuffer(buffer.toString('binary'));
    const asn1 = forge.asn1.fromDer(der);
    const publicKey = forge.pki.publicKeyFromAsn1(asn1);
    return {
        n: publicKey.n.toString(),
        e: parseInt(publicKey.e.toString())
    };
}

/**
 * @swagger
 * /registerUser:
 *   post:
 *     summary: Register a user with their public key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - publicKey
 *             properties:
 *               userId:
 *                 type: string
 *               publicKey:
 *                 type: object
 *                 properties:
 *                   e:
 *                     type: integer
 *                   n:
 *                     type: string
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Missing fields or user already registered
 *       500:
 *         description: Internal server error
 */
app.post("/registerUser", async (req, res) => {
    const { userId, publicKey } = req.body;

    if (!userId || !publicKey?.n || !publicKey?.e) {
        return res.status(400).json({ error: "userId and publicKey are required" });
    }

    try {
        const publicKeyBytes = rsaJsonToDerBytes(publicKey);

        const isRegistered = await contract.isUserRegistered(userId);
        if (isRegistered) {
            return res.status(400).json({ error: "User ID is already registered" });
        }

        const tx = await contract.setPublicKey(userId, publicKeyBytes);
        await tx.wait();

        res.status(200).json({ message: "User registered successfully", txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /getUser/{userId}:
 *   get:
 *     summary: Get a user's public key
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to fetch
 *     responses:
 *       200:
 *         description: Successfully retrieved public key
 *       404:
 *         description: User not registered
 *       500:
 *         description: Internal server error
 */
app.get("/getUser/:userId", async (req, res) => {
    const { userId } = req.params;
    try {
        const isRegistered = await contract.isUserRegistered(userId);
        if (!isRegistered) {
            return res.status(404).json({ error: "User not registered" });
        }

        const publicKeyBytes = await contract.getPublicKey(userId);
        const buffer = Buffer.from(publicKeyBytes.slice(2), 'hex'); // remove 0x
        const jsonKey = derBytesToRsaJson(buffer);

        res.status(200).json({ userId, publicKey: jsonKey });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /updateUser:
 *   post:
 *     summary: Update a registered user's public key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - publicKey
 *             properties:
 *               userId:
 *                 type: string
 *               publicKey:
 *                 type: object
 *                 properties:
 *                   e:
 *                     type: integer
 *                   n:
 *                     type: string
 *     responses:
 *       200:
 *         description: Public key updated successfully
 *       400:
 *         description: Missing fields
 *       404:
 *         description: User not registered
 *       500:
 *         description: Internal server error
 */
app.post("/updateUser", async (req, res) => {
    const { userId, publicKey } = req.body;

    if (!userId || !publicKey?.n || !publicKey?.e) {
        return res.status(400).json({ error: "userId and publicKey are required" });
    }

    try {
        const isRegistered = await contract.isUserRegistered(userId);
        if (!isRegistered) {
            return res.status(404).json({ error: "User not Registered" });
        }

        const publicKeyBytes = rsaJsonToDerBytes(publicKey);
        const tx = await contract.updatePublicKey(userId, publicKeyBytes);
        await tx.wait();

        res.status(200).json({ message: `Public Key updated for User ID: ${userId}`, txHash: tx.hash });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * @swagger
 * /deleteUser/{userId}:
 *   delete:
 *     summary: Delete a user's public key
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not registered
 *       500:
 *         description: Internal server error
 */
app.delete("/deleteUser/:userId", async (req, res) => {
    const { userId } = req.params;

    try {
        const isRegistered = await contract.isUserRegistered(userId);
        if (!isRegistered) {
            return res.status(404).json({ error: "User not Registered" });
        }

        const tx = await contract.deletePublicKey(userId);
        await tx.wait();

        res.status(200).json({ message: `User with User ID: ${userId} deleted successfully` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});
