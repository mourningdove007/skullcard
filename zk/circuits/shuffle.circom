pragma circom 2.1.0;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/comparators.circom";

template ShuffleCircuit(n, nTotalLeaves) {

    signal input cards[n];
    signal input salts[n];
    signal output root;

    signal occurrences[n][n];
    
    for (var v = 0; v < n; v++) {
        var rowSum = 0;
        
        for (var i = 0; i < n; i++) {
            occurrences[v][i] <== IsEqual()([cards[i], v]);
            rowSum += occurrences[v][i];
        }
        
        rowSum === 1;
    }

    component leafHashes[nTotalLeaves];
    
    
    for (var i = 0; i < n; i++) {
        leafHashes[i] = Poseidon(2);
        leafHashes[i].inputs[0] <== cards[i];
        leafHashes[i].inputs[1] <== salts[i];
    }

    
    for (var i = n; i < nTotalLeaves; i++) {
        leafHashes[i] = Poseidon(2);
        leafHashes[i].inputs[0] <== 0;
        leafHashes[i].inputs[1] <== 0;
    }

    component upperHashes[nTotalLeaves - 1]; 
    
    for (var i = 0; i < 32; i++) {
        upperHashes[i] = Poseidon(2);
        upperHashes[i].inputs[0] <== leafHashes[2*i].out;
        upperHashes[i].inputs[1] <== leafHashes[2*i+1].out;
    }

    var offset = 0;
    var next_offset = 32;
    for (var levelSize = 16; levelSize >= 1; levelSize /= 2) {
        for (var i = 0; i < levelSize; i++) {
            upperHashes[next_offset + i] = Poseidon(2);
            upperHashes[next_offset + i].inputs[0] <== upperHashes[offset + 2*i].out;
            upperHashes[next_offset + i].inputs[1] <== upperHashes[offset + 2*i + 1].out;
        }
        offset = next_offset;
        next_offset += levelSize;
    }

    root <== upperHashes[nTotalLeaves - 2].out;
}

component main = ShuffleCircuit(52, 64);