use ff::Field;
use halo2_poseidon::poseidon::primitives::{generate_constants, ConstantLength, Hash, Mds, Spec};
use halo2curves::bn256::Fr;

#[derive(Debug)]
pub struct PoseidonBn256Spec;

impl Spec<Fr, 3, 2> for PoseidonBn256Spec {
    fn full_rounds() -> usize {
        8
    }

    fn partial_rounds() -> usize {
        56
    }

    fn sbox(val: Fr) -> Fr {
        val.pow_vartime([5])
    }

    fn secure_mds() -> usize {
        0
    }

    fn constants() -> (Vec<[Fr; 3]>, Mds<Fr, 3>, Mds<Fr, 3>) {
        generate_constants::<Fr, Self, 3, 2>()
    }
}

pub fn bn256_poseidon2(a: Fr, b: Fr) -> Fr {
    Hash::<_, PoseidonBn256Spec, ConstantLength<2>, 3, 2>::init().hash([a, b])
}
