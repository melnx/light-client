
window.emulateSendInputs = function(payload){
    console.log("SWAPPING BACK EQUAL AMOUNT")
    
    let floatValue = payload[1];

    let digitsNeeded = floatValue.length - 18;

    if(!floatValue.includes('.') && digitsNeeded<0){
        floatValue = '0.' + "0".repeat(Math.abs(digitsNeeded)) + floatValue;
        floatValue = floatValue.replace(/0+$/, '');
    }


    //http://localhost:8081/#/transfer/0xC563388e2e2fdD422166eD5E76971D11eD37A466/0x7c796a17170Efee0D32A183D37005186Db0b24a9?amount=0.01

    //'Receiving transfer of value',
    //locked.lock.amount.toString(),
    //'of token',
    //channel.token,
    //', from',
    //locked.initiator,
    //', through partner',
    //partner,

    let mediate = true;

    let tokenAddress = payload[3];
    let targetAddress = mediate ? '0xA18BBc603D4A091E234b8908bEdad65aC405f56c' : payload[5];    

    let otherTokenAddress = mediate ? tokenAddress : tokenAddress == '0x59105441977ecD9d805A4f5b060E34676F50F806' ? '0xC563388e2e2fdD422166eD5E76971D11eD37A466' : '0x59105441977ecD9d805A4f5b060E34676F50F806';
    //let otherAddress = targetAddress == '0x7c796a17170Efee0D32A183D37005186Db0b24a9' ? '0x2bd70741A88CB4058EAEBb7b7455958448D221F4' : '0x7c796a17170Efee0D32A183D37005186Db0b24a9';

    let url = `#/transfer/${otherTokenAddress}/${targetAddress}?amount=${floatValue}`
    console.log(url);
    window.location.href = url;

    /*
    console.log("TARGET ADDRESS", targetAddress, "TARGET TOKEN", otherTokenAddress);
    document.getElementById('address-input').value = targetAddress;

    console.log("SETTING VALUE", payload[1], floatValue, typeof floatValue);
    let amountInput = document.querySelectorAll('[placeholder="Amount"]')[0];
    console.log("AMOUNT INPUT", amountInput);
    amountInput.value = floatValue;
    */

    setTimeout(()  => {
        let subm = document.querySelectorAll('[type="submit"]')[0];
        console.log("TRIGGERING TRANSFER SUBMIT");
        subm.click();
    }, 5000);
}

function renderOrderbook(){
    let orders = [{
        originToken:"0x59105441977ecD9d805A4f5b060E34676F50F806", 
        targetToken:"0xC563388e2e2fdD422166eD5E76971D11eD37A466",
        sourceAmount: "0.01",
        targetAmount: "0.01",
        maker: "0x7c796a17170Efee0D32A183D37005186Db0b24a9",
    }];


    let book = document.createElement('div');


    function getRow(order){
        let row = document.createElement('div');
        row.innerHTML = `
            ${order.sourceAmount} TTT (${order.originToken}) 
            <br /> => <br /> 
            ${order.targetAmount} TTT (${order.targetToken})
            <br />
            BY ${order.maker}
        `;

        let want = document.createElement('button');
        want.innerHTML = 'fill';
        want.style.border = '1px solid gray';
        want.style.padding = '5px';
        want.style.display = 'block';
        want.onclick = () => {
            console.log("FILLING ORDER");

            /*let amountWei = order.targetAmount;

            amountWei = amountWei.split('.')[1];
            let lendiff = 18 - amountWei;
            if(lendiff > 0){
                amountWei = amountWei + '0'.repeat(lendiff);
                amountWei = amountWei.replace(/^0+/, '');
            }*/

            book.style.display = 'none';

            window.emulateSendInputs([
                "fill order",                
                order.targetAmount,
                "from  token",
                order.originToken,
                "from",
                order.maker                
            ]);


        }

        row.appendChild(want)
        row.style.padding = '5px';
        row.style.margin = '5px';
        row.style.border = '1px solid gray';
        row.style.borderRadius = '10px';
        
        return row;
    }

    let toggle = document.createElement('div');
    toggle.style.position = "fixed"
    toggle.style.left = "50px";
    toggle.style.top = "10px";
    toggle.style.height = "40px";
    toggle.style.width = "40px";
    toggle.style.borderRadius = '20px';
    toggle.style.background = 'green';
    toggle.style.color = "white";
    toggle.style.padding = '10px 15px 0px 15px';
    toggle.innerHTML = '+';
    toggle.style.border = '1px solid white';

    document.body.appendChild(toggle);



    book.style.position = "fixed";
    book.style.top = '60px';
    book.style.left = '40px';
    book.style.right = '40px';
    book.style.height = '400px';
    book.style.display = 'none';
    book.style.background = 'white';
    book.style.opacity = '0.9';

    for(var order in orders){
        book.appendChild(getRow(orders[order]));
    }

    toggle.onclick = function(){
        book.style.display =  book.style.display=='none' ? 'block' : 'none';
    }

    document.body.appendChild(book);
}

renderOrderbook();


function renderRaidenApi(){
    let book = document.createElement('div');

    let toggle = document.createElement('div');
    toggle.style.position = "fixed"
    toggle.style.left = "50px";
    toggle.style.top = "10px";
    toggle.style.height = "40px";
    toggle.style.width = "40px";
    toggle.style.borderRadius = '20px';
    toggle.style.background = 'green';
    toggle.style.color = "white";
    toggle.style.padding = '10px 15px 0px 15px';
    toggle.innerHTML = '+';
    toggle.style.border = '1px solid white';

    document.body.appendChild(toggle);



    book.style.position = "fixed";
    book.style.top = '60px';
    book.style.left = '40px';
    book.style.right = '40px';
    book.style.height = '400px';
    book.style.display = 'none';
    book.style.background = 'white';
    book.style.opacity = '0.9';

    //for(var order in orders){
      //  book.appendChild(getRow(orders[order]));
    //}

    toggle.onclick = function(){
        book.style.display =  book.style.display=='none' ? 'block' : 'none';
    }

    document.body.appendChild(book);
}


window.raiden = $vm0.$raiden;

renderRaidenApi();