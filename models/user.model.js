const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    userId:{
        type:String,
        required:true,
        unique:true
    },
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true
    },
    
})


module.exports = mongoose.model('UserModel',userSchema)