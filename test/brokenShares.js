const truffleAssert = require('./helpers/truffle-assertions');
const timeWarp = require("./helpers/timeWarp");
const {e18, e9, getInitData, getDataParameter, sansBorrowFee} = require("./helpers/utils");
const BentoBox = artifacts.require("BentoBox");
const SushiSwapFactory = artifacts.require("UniswapV2Factory");
const UniswapV2Pair = artifacts.require("UniswapV2Pair");
const Pair = artifacts.require("LendingPair");
const RebaseToken = artifacts.require("RebaseToken");
const ReturnFalseERC20 = artifacts.require("ReturnFalseERC20");
const RevertingERC20 = artifacts.require("RevertingERC20");
const TestOracle = artifacts.require("TestOracle");
const SushiSwapSwapper = artifacts.require("SushiSwapSwapper");
const FlashLoanRebaseSkimmer = artifacts.require("FlashLoanRebaseSkimmer");

contract('BrokenShares', (accounts) => {
  let a;
  let b;
  let pair_address;
  let pair;
  let bentoBox;
  let bentoFactory;
  let swapper;
  const alice = accounts[1];
  const bob = accounts[2];
  const eve = accounts[3];

  before(async () => {
    bentoBox = await BentoBox.deployed();
    pairMaster = await Pair.deployed();

    // a = await RebaseToken.new("Rebase Token A", "RBA", { from: accounts[0] });
    // b = await RebaseToken.new("Rebase Token B", "RBB", { from: accounts[0] });
    a = await ReturnFalseERC20.new("Token A", "A", e18(10000000), { from: accounts[0] });
    b = await RevertingERC20.new("Token B", "B", e18(10000000), { from: accounts[0] });

    let factory = await SushiSwapFactory.new(accounts[0], { from: accounts[0] });
    swapper = await SushiSwapSwapper.new(bentoBox.address, factory.address, { from: accounts[0] });
    await pairMaster.setSwapper(swapper.address, true);

    let tx = await factory.createPair(a.address, b.address);

    await a.transfer(alice, e18(1000));
    await b.transfer(bob, e18(1000));

    oracle = await TestOracle.new({ from: accounts[0] });
    await oracle.set(e18(1), accounts[0]);

    await bentoBox.setMasterContractApproval(pairMaster.address, true, { from: alice });
    await bentoBox.setMasterContractApproval(pairMaster.address, true, { from: bob });

                                                // collateral //asset
    let initData = await pairMaster.getInitData(a.address, b.address, oracle.address, "0x");
    tx = await bentoBox.deploy(pairMaster.address, initData);
    pair_address = tx.logs[0].args[2];
    pair = await Pair.at(pair_address);
  });


  it('rebase token without sync() breaks bento', async () => {
    // deposit assets
    await b.approve(bentoBox.address, e18(300), { from: bob });
    await pair.addAsset(e18(290), { from: bob });

    // deposit colateral
    await a.approve(bentoBox.address, e18(1000), { from: alice });
    await pair.addCollateral(e18(100), { from: alice });

    // borrow
    await pair.borrow(sansBorrowFee(e18(55)), alice, { from: alice });

    // calculate borrow share to amount of alice
    let userBorrowAmount = await pair.userBorrowAmount(alice);
    console.log("aliceBorrowAmount before: ", userBorrowAmount.toString());

    // make a gift - call sync
    await b.transfer(bentoBox.address, e18(300));
    await bentoBox.sync(b.address);

    // calculate borrow share to amount of alice again
    userBorrowAmount = await pair.userBorrowAmount(alice);
    console.log("aliceBorrowAmount after: ", userBorrowAmount.toString());

    // check that absulete amount did not change.

    // try to liquidate, expect to revert
    await b.approve(bentoBox.address, e18(25), { from: bob });
    await truffleAssert.reverts(pair.liquidate([alice], [e18(5)], bob, "0x0000000000000000000000000000000000000000", true, { from: bob }), 'LendingPair: all users are solvent');
  });



});
