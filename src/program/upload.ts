import { GearApi, GearKeyring, getWasmMetadata } from '@gear-js/api';
import { KeyringPair } from '@polkadot/keyring/types';
import { decodeAddress } from '@gear-js/api';
import { readFileSync, writeFileSync } from 'fs';
import { PATH_TO_OPT, PATH_TO_META } from '../config';

let id = '';
let metaString = '';

async function postMetadata(
    api: GearApi,
    user: KeyringPair,
    programId: string,
) {
    let genesis = api.genesisHash.toHex();

    const metaFile = readFileSync(PATH_TO_META);
    let meta = await getWasmMetadata(metaFile);
    let signed = GearKeyring.sign(user, JSON.stringify(meta));

    let params = {
        "name": meta.title,
        "meta": JSON.stringify(meta),
        "title": meta.title,
        "metaWasm": Buffer.from(metaFile).toString('base64'),
        "signature": '0x' + Buffer.from(signed).toString('hex'),
        "programId": programId,
        "genesis": genesis,
    };

    // console.log(params);

    let body = {
        "id": Math.floor(Math.random() * 100),
        "jsonrpc": "2.0",
        "method": "program.meta.add",
        "params": params,
    };

    let resp = await fetch("https://idea.gear-tech.io/api", {
        "headers": {
            "Accept": "application/json",
            "content-type": "application/json;charset=utf-8",
        },
        body: JSON.stringify(body),
        "method": "POST",
    });

    return await resp.json();
}


async function uploadCode() {
    const api = await GearApi.create({
        // providerAddress: 'wss://rpc-node.gear-tech.io',
        providerAddress: 'wss://node-workshop.gear.rs',
    });

    // const user = await GearKeyring.fromSuri('//Alice');
    const mnemonic = process.env.MNEMONIC;
    const user = await GearKeyring.fromMnemonic(mnemonic);
    console.log(`User logined address: ${user.address}`);

    const code = readFileSync(PATH_TO_OPT);

    const metaFile = readFileSync(PATH_TO_META);
    const meta = await getWasmMetadata(metaFile);
    metaString = meta.types.toString();
    console.log(`MetaString: ${metaString}`);

    const uploadProgram = {
        code,
        gasLimit: 20000_000_000,
        value: 0,
        initPayload: "0x00",
    }
    let { codeId } = await api.program.upload(uploadProgram, meta);
    console.log(`CodeId: ${codeId}\n`);

    if (!await api.code.exists(codeId)) {
        console.log("CodeID not found, uploading...");
        await new Promise((resolve, reject) => {
            api.program.signAndSend(user, ({ events, status }) => {
                console.log(`STATUS: ${status.toString()}`);
                if (status.isFinalized) {
                    resolve(status.asFinalized);
                }
                events.forEach(({ event }) => {
                    if (event.method === "ExtrinsicFailed") {
                        reject(api.getExtrinsicFailedError(event).docs.join("\n"));
                    } else if (event.method === 'CodeChanged' && status.isInBlock) {
                        let json = JSON.stringify(event.toHuman(), undefined, 2)
                        console.log(json);
                        let result = JSON.parse(json);
                    }
                });
            });
        });
    } else {
        console.log("CodeID already exists, skipping upload...");
    }


    let gas = await api.program.calculateGas.initCreate(
        decodeAddress(user.address),
        codeId,
        "0x00",
        0,
        true,
        meta,
    );

    let { programId, extrinsic } = api.program.create({
        codeId,
        initPayload: "0x00",
        gasLimit: gas.min_limit,
    }, meta);

    console.log({ codeId, programId });
    id = programId;

    await new Promise((resolve, reject) => {
        api.program.signAndSend(user, ({ events, status }) => {
            // console.log(`STATUS: ${status.toString()}`);
            if (status.isFinalized) {
                resolve(status.asFinalized);
            }
            events.forEach(({ event }) => {
                if (event.method === "ExtrinsicFailed") {
                    reject(api.getExtrinsicFailedError(event).docs.join("\n"));
                }
            });
        });
    });

    console.log("Posting metadata...");

    let resp = await postMetadata(api, user, programId);
    console.log({ resp })

    // assert program exists
    if (!await api.program.exists(programId)) {
        throw new Error("Program not found");
    } else {
        console.log("program uploaded, id: ", programId);
    }
};

uploadCode()
    .then(() => {
        writeFileSync('programID.txt', `REACT_APP_PROGRAM_ID=${id}`);
        writeFileSync('metaString.txt', `REACT_APP_META_TYPES=${metaString}`);
        process.exit(0)
    })
    .catch((error) => {
        console.log(error);
        process.exit(1);
    });
