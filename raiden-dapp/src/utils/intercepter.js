
genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

genSecret = () => '0x' + genRanHex(64);

window.myaddress = '0x00000';
if(!window.knownSecrets){ 
    window.knownSecrets = {};
}

window.matchOrder = function(secrethash, amount, token, maker, taker){
    if(amount == '3000000000000000'){
        return {
            secrethash: secrethash,

            maker: maker,
            amount: amount,
            token: token,

            taker: taker,
            amount2: amount,
            token2: token,
        }
    }else{
        return null;
    }
}

window.logInterceptor = function(){
    
    
    if(arguments[0].includes("action")){
        //console.log("INTERCEPTED");
        //console.log("ACTION", arguments[2]);   

        /*
        //EXAMPLE SECRET REVEAL ACTION
        {
            "type": "transfer/secret",
            "payload": {
                "secret": "0xcdbb9828e35cb622669004ca49bcedbf85e0c62158f39e05a417eaf6a25dcc13"
            },
            "meta": {
                "secrethash": "0x76612fa8442f39339177af0ac233a33f5fb05ed8a498521a2a5c730dbc5ba941",
                "direction": "sent"
            }
        }
        */
        let action = arguments[2];  
        if(action.type == 'transfer/secret'){
            let secret = action.payload.secret;
            let secrethash = action.meta.secrethash;
            //if this isn't a secret you know yet, reveal it and claim your payment
            if(!knownSecrets[secrethash]) {    
                //this isnt required because when maker reveals all payments get unlopcked            
                //$vm0.$raiden.revealSecretAndClaim(secret);
            }
        }                
    }else if(arguments[0] == "Receiving transfer of value"){        
        //window.emulateSendInputs(arguments);    
        console.log("INCOMING PAYMENT");
        console.log("ARGS", arguments);

        let amount = arguments[1];
        let token = arguments[3];
        let sender = arguments[5];
        let secrethash = arguments[9];

        console.log("AMOUNT", amount);
        console.log("SENDER", sender);
        console.log("TOKEN", token);
        console.log("SECRET HASH", secrethash);

                
        if(!knownSecrets[secrethash]){
            //if you dont know the secret for this payment send back equivalent payment                       
            let order = matchOrder(secrethash, amount, token, sender, myaddress);

            if(amount == order.amount){
                setTimeout(function(){   
                    transferTokens(sender, order.token2, order.amount2, secrethash, true);

                    setTimeout(function(){             
                        console.log(`
                        =======================================\n\n
                        SENT BACK SAME AMOUNT WITH SAME HASH\n\n
                        =======================================\n`);
                    }, 1500);                    
                }, 15000);
            }
        }else{
            //otherwise claim your payment from the taker
            let order = matchOrder(secrethash, amount, token, myaddress, sender);

            if(amount == order.amount2){
                setTimeout(function(){
                    $vm0.$raiden.revealSecretAndClaim(knownSecrets[secrethash]);

                    setTimeout(function(){
                        console.log(`
                        ==========================================\n\n
                        RECEIVED COUNTER PAYMENT, UNLOCKED SECRET\n\n
                        ==========================================\n`);
                    }, 1500)                    
                }, 15000)
            }
        }
    }else{


        console.log("UNKNOWN MESSAGE TYPE");
        console.log(arguments);
    }
}

window.generatePaths = function(reverse){
    let known_addresses = {
        "0x45E3aC98Ad7590d1E84db4aE9CE146C878ba773a": {
            "user_id": "@0x45e3ac98ad7590d1e84db4ae9ce146c878ba773a:transport.transport01.raiden.network",
            "displayname": "0xe17bbdb3e286f14d4055651f1a22583f9606cac748462950bdfcf111724e070768cfa8be0af38d4b1ae604df134624f4eb9c66ba4bd72018003e66b57e1b20991c",                    
            "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1"
        },
        "0x75f92B5cd58C97168B9fCF2CfB90b0aE3Efe0b25":{
            "user_id": "@0x75f92b5cd58c97168b9fcf2cfb90b0ae3efe0b25:transport.transport01.raiden.network",
            "displayname": "0x54d2a5834f70cad8d6020b9829ed70b0e674290ef3706bef17dd0102b60fd94e2073017d0ee67a6db9de329dc9f5954d2aa381a74448ae2fcdbaa8a3890d00f41c",                    
            "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1"
        },
        "0x505F15FCa04b1EA9a6294E2C2e95606E4C284505":{
            "user_id": "@0x505f15fca04b1ea9a6294e2c2e95606e4c284505:transport.transport01.raiden.network",
            "displayname": "0xce1abecccee14b07d05329d8f97ec0334489de659259865ea686bccb9de4dd5a00a9df2022ced07e600ccfafa3340f293b8c05817c111d89def4179c67d12c5c1b",                    
            "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1"
        }
    };

    let users = [
        "0x45E3aC98Ad7590d1E84db4aE9CE146C878ba773a",
        "0x505F15FCa04b1EA9a6294E2C2e95606E4C284505"
    ]

    let source = !reverse ? users[0] : users[1];
    let target = !reverse ? users[1] : users[0];

    return [
        {
            address_metadata: known_addresses,
            displayFee: "0", fee: "0x00", hops: 2, key: 0,
            path:[
                source,
                "0x75f92B5cd58C97168B9fCF2CfB90b0aE3Efe0b25",
                target,
            ]
        }
    ];
}

window.multihop = true;

window.transferTokens = async function(targetAddress, tokenAddress, amount, secrethash, reverseDirection){
    if(!tokenAddress) tokenAddress = '0xC563388e2e2fdD422166eD5E76971D11eD37A466';// '0x59105441977ecD9d805A4f5b060E34676F50F806'; //'0xC563388e2e2fdD422166eD5E76971D11eD37A466';//                                         
    if(!amount) amount = 3000000000000000;

    let secret = !secrethash ? genSecret() : null;
    console.log("MANUAL SECRET", secret);

    let hashOfSecret = secrethash ? secrethash : $vm0.$raiden.getHashOfSecret(secret);
    console.log("MANUAL HASH OF SECRET", hashOfSecret);

    //make sure you remember the secret for the future reveal
    if(secret) knownSecrets[hashOfSecret] = secret;

    let paths = window.multihop ? generatePaths(reverseDirection) : undefined;
    if(!targetAddress) targetAddress = '0x505F15FCa04b1EA9a6294E2C2e95606E4C284505'; //'0x2bd70741A88CB4058EAEBb7b7455958448D221F4';

    await $vm0.$raiden.transfer( 
        tokenAddress,
        targetAddress,
        amount,   
        undefined,
        paths,
        hashOfSecret, 
        //secret,
        //true,
    )
}
