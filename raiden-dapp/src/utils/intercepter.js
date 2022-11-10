
genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

genSecret = () => '0x' + genRanHex(64);

if(!window.knownSecrets){ 
    window.knownSecrets = {};
}

window.matchOrder = function(secrethash, amount, token, maker, taker){
    if(amount == '3000000000000000'){

        let token2 = token==window.tokens[0] ? window.tokens[1] : window.tokens[0];

        return {
            secrethash: secrethash,

            maker: maker,
            amount: amount,
            token: token,

            taker: taker,
            amount2: amount,
            token2: token2,
        }
    }else{
        return null;
    }
}

window.logInterceptor = function(){
    
    let cmd = arguments[0];
    
    if(typeof cmd == 'string' && cmd.includes("action")){
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
    }else if(cmd == "Receiving transfer of value"){        
        //window.emulateSendInputs(arguments);    
        console.log("INCOMING PAYMENT");
        console.log("ARGS", arguments);

        let amount = arguments[1];
        let token = arguments[3];
        let sender = arguments[5];
        let secrethash = arguments[9];
        let myaddress = arguments[11];
        let tokennetwork = arguments[13];

        console.log("AMOUNT", amount);
        console.log("SENDER", sender);
        console.log("TOKEN", token);
        console.log("SECRET HASH", secrethash);
        console.log("TOKEN NETWORK", tokennetwork);
                
        if(!knownSecrets[secrethash]){
            //if you dont know the secret for this payment send back equivalent payment                       
            let order = matchOrder(secrethash, amount, token, sender, myaddress);

            if(order && amount == order.amount){
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
            //otherwise claim your payment from the taker and reveal the secret
            let order = matchOrder(secrethash, amount, token, myaddress, sender);

            if(order && amount == order.amount2){
                setTimeout(function(){
                    $vm0.$raiden.revealSecretAndClaim(knownSecrets[secrethash], tokennetwork);

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

window.getJsomFromUrl = function(url, callback) {
    var xhr = new XMLHttpRequest();

    xhr.open('GET', url, true);  
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest'); 
    xhr.setRequestHeader('Access-Control-Allow-Origin', '*');  
    //xhr.responseType = 'json';
    xhr.onload = function() {
      var status = xhr.status;
      if (status === 200) {
        callback(null, xhr.response);
      } else {
        callback(status, xhr.response);
      }
    };
    xhr.send();
};
window.getAddressMetadata = function(address){
    getJsomFromUrl(`https://pfs.transport01.raiden.network/api/v1/address/${address}/metadata`, function(status, data){
        console.log(JSON.parse(data));
    })
}

window.generatePaths = function(reverse){

    //"0x625F82D937ccA0f1fF0097864895ba91635309A3"  TTT 59

    let users = {
        //blue (left)
        "0x294629Fc10aEbB0C1357F7CEB7Dc6Ca5c5c2282C": {"user_id": "@0x294629fc10aebb0c1357f7ceb7dc6ca5c5c2282c:transport.transport01.raiden.network", "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1", "displayname": "0x0bd025e88c25adb422c6ad07680e0fcf16f5246ed36a79975fb56c78fa8aef856d47ea77b6c36b48a02ddde5a0a4d06640de40da688ce37d21f96fef581531711b"},
        //purple (middle)
        "0x55e86d5357529De6193824963eA50CD8e1fECEef": {"user_id": "@0x55e86d5357529de6193824963ea50cd8e1feceef:transport.transport01.raiden.network", "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1", "displayname": "0xfb10211f1d00288e9cccecd2743ee31969451b994ca30ffa472155e2bc47283c3ae76a000ac39683843f001878e21a7be685ee474b3a19e4056788e21029c7801c"},
        //red (right)
        "0xC4c648D411b2c2a2CBD475257c8e1A92ABf45e79": {"user_id": "@0xc4c648d411b2c2a2cbd475257c8e1a92abf45e79:transport.transport01.raiden.network", "capabilities": "mxc://raiden.network/cap?Receive=1&webRTC=1&Delivery=1&Mediate=1&toDevice=1&immutableMetadata=1", "displayname": "0xb431a1a8dc6fc72c1c7ae77d7dbb508ae0c7613ac2b0dae1ef56bf9d51d714aa7c859ac3420d2da0d4d1b9b562bc811cfd5aa339a817340fd0990ffc6a91f5d31c"}
    };

    let addresses = Object.keys(users);
    
    let source = !reverse ? addresses[0] : addresses[2];
    let target = !reverse ? addresses[2] : addresses[0];
    let mediator = addresses[1];

    return [
        {
            address_metadata: users,
            displayFee: "0", fee: "0x00", hops: 2, key: 0,
            path:[
                source,
                mediator,
                target,
            ]
        }
    ];
}

window.multihop = true;

window.tokens = [
    '0x59105441977ecD9d805A4f5b060E34676F50F806',
    '0xC563388e2e2fdD422166eD5E76971D11eD37A466',    
]

window.transferTokens = async function(targetAddress, tokenAddress, amount, secrethash, reverseDirection){
    if(!tokenAddress) tokenAddress = tokens[0];
    if(!amount) amount = 3000000000000000;

    let secret = !secrethash ? genSecret() : null;
    console.log("MANUAL SECRET", secret);

    let hashOfSecret = secrethash ? secrethash : $vm0.$raiden.getHashOfSecret(secret);
    console.log("MANUAL HASH OF SECRET", hashOfSecret);

    //make sure you remember the secret for the future reveal
    if(secret) knownSecrets[hashOfSecret] = secret;

    let paths = window.multihop ? generatePaths(reverseDirection) : undefined;
    if(!targetAddress) targetAddress = '0xC4c648D411b2c2a2CBD475257c8e1A92ABf45e79';

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
