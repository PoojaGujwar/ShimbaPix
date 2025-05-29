function verifyAccessToken(req,res,next){
    if(!req.cookies.access_token){
        return res.status(403).json({error:"Access Denied",error})
    }
    console.log("Cookie",req.cookies)
    next()
}
module.exports = {verifyAccessToken}